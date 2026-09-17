-- ════════════════════════════════════════════════════════════════════════════
-- Partner Visa CRM — catch-up migration
--
-- Run this ONCE in the Supabase SQL editor, after schema.sql and seed.sql.
--
-- It applies every migration the app currently needs, in order, and is fully
-- idempotent: each step is skipped if already present, so it is safe whether
-- your database is brand new or partway through.
--
-- Covers:
--   * Security hardening — bucket limits, document path trigger, rate limiting
--   * End-to-end encryption — user_crypto, document envelope, bucket accepts ciphertext
--   * Filename blinding — name_cipher / name_iv
--   * Crypto state guard — refuse an unusable user_crypto row
--
-- It does NOT cover the 309/100 checklist rewrite. Run
-- migrations/2026-09-14-offshore-309-100.sql separately if you seeded before
-- the app switched from the onshore 820/801 checklist.
-- ════════════════════════════════════════════════════════════════════════════

begin;


-- ────────────────────────────────────────────────────────────────────────────
-- Security hardening — bucket limits, document path trigger, rate limiting
-- ────────────────────────────────────────────────────────────────────────────
-- Size and MIME limits are set on the bucket so Storage enforces them itself.
-- The browser also checks, but that check is advisory: every user holds the
-- anon key and can call the storage API directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visa-documents', 'visa-documents', false,
  20971520,  -- 20 MB
  array['application/pdf','image/jpeg','image/png','image/gif','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage object policy and RLS ───────────────────────────────────────────
-- storage.objects is owned by supabase_storage_admin. Depending on the project,
-- the SQL editor's role may not own it, in which case both "alter table ...
-- enable row level security" and "create policy ... on storage.objects" fail
-- with 42501 "must be owner of table objects".
--
-- That must not abort the rest of this script, so both are attempted here and
-- downgraded to a warning if refused. If you see the warning, create the policy
-- from the Supabase Dashboard instead: Storage -> visa-documents -> Policies.
-- Until it exists, the bucket is still private, but a signed-in user could read
-- another user's object if they learned its path.
do $$
begin
  begin
    execute $p$drop policy if exists "own visa documents" on storage.objects$p$;
    execute $p$
      create policy "own visa documents" on storage.objects
        for all
        using (
          bucket_id = 'visa-documents'
          and exists (
            select 1 from applications a
            where a.id = ((storage.foldername(name))[1])::uuid
              and a.owner_id = auth.uid()
          )
        )
        with check (
          bucket_id = 'visa-documents'
          and exists (
            select 1 from applications a
            where a.id = ((storage.foldername(name))[1])::uuid
              and a.owner_id = auth.uid()
          )
        )
    $p$;
    raise notice 'storage.objects policy "own visa documents" created.';
  exception
    when insufficient_privilege then
      raise warning 'SKIPPED: could not create the storage policy (not the owner of storage.objects). Create it from the Dashboard: Storage -> visa-documents -> Policies.';
  end;
end $$;

-- Row level security on storage.objects. Supabase enables this by default; it
-- cannot be set from here without ownership, so it is checked and reported.
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    raise warning 'Row level security is OFF on storage.objects. Turn it on in the Supabase Dashboard before uploading anything: without it the bucket policy is inert and every document is readable by any signed-in user.';
  else
    raise notice 'storage.objects row level security: on.';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Repair: objects defined after the storage policy in the original schema.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Reapplied defensively. On Supabase, "create policy ... on storage.objects"
-- does work from the SQL editor even though "alter table ... enable row level
-- security" does not, so schema.sql normally runs to completion and these
-- already exist. On a stricter Postgres the create policy would abort the run
-- and everything below it would be missing. All idempotent either way.

-- ── Helper: instantiate a fresh checklist for a new application ────────────
create or replace function seed_application_items(app_id uuid)
returns void language sql as $$
  insert into application_items (application_id, item_id)
  select app_id, ci.id from checklist_items ci
  on conflict (application_id, item_id) do nothing;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- ADDED BY THE BUILD — everything above this line is unchanged.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Profiles: records disclaimer acceptance at signup ─────────────────────
-- The brief requires the "not migration advice" disclaimer to be accepted at
-- signup with the timestamp stored. There was nowhere to put it, so:
--
-- The row is created by a trigger on auth.users at the moment of signup, and
-- the timestamp is stamped server-side with now() — never sent by the client.
-- There is deliberately NO update policy, so a user can read their acceptance
-- record but cannot alter or erase it. That is what makes it usable as an
-- actual record of consent rather than a self-reported claim.
create table if not exists profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  disclaimer_accepted_at timestamptz,
  disclaimer_version     text,
  created_at             timestamptz not null default now()
);

alter table profiles enable row level security;

-- Read-only to the owner. No insert/update/delete policy: the trigger below
-- writes the row, and nothing else may change it.
drop policy if exists "own profile - read" on profiles;
create policy "own profile - read" on profiles
  for select using (id = auth.uid());

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, disclaimer_accepted_at, disclaimer_version)
  values (
    new.id,
    new.email,
    -- Stamped server-side. The client can only assert that it accepted; it
    -- cannot choose the time.
    case
      when new.raw_user_meta_data->>'disclaimer_accepted' = 'true' then now()
      else null
    end,
    new.raw_user_meta_data->>'disclaimer_version'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Indexes ───────────────────────────────────────────────────────────────
-- Postgres does not index foreign keys automatically, and every RLS policy
-- above runs an EXISTS subquery across these columns on every row touched.
-- Without these, each query degrades as the table grows.
create index if not exists applications_owner_id_idx        on applications (owner_id);
create index if not exists application_items_app_id_idx     on application_items (application_id);
create index if not exists application_items_item_id_idx    on application_items (item_id);
create index if not exists documents_app_item_id_idx        on documents (application_item_id);
create index if not exists ai_messages_app_id_created_idx   on ai_messages (application_id, created_at);
create index if not exists checklist_items_category_id_idx  on checklist_items (category_id);

-- ── Keep updated_at honest ────────────────────────────────────────────────
-- Both tables default updated_at to now() but nothing ever moves it.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_touch_updated_at on applications;
create trigger applications_touch_updated_at
  before update on applications
  for each row execute function touch_updated_at();

drop trigger if exists application_items_touch_updated_at on application_items;
create trigger application_items_touch_updated_at
  before update on application_items
  for each row execute function touch_updated_at();

-- ── Rate limiting (H3, H4) ───────────────────────────────────────────────────
-- Per-user counters held in the database rather than in process memory, because
-- serverless instances do not share memory and an in-memory limiter is trivially
-- bypassed by spreading requests across cold starts.
create table if not exists rate_limits (
  user_id      uuid not null references auth.users(id) on delete cascade,
  action       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, action, window_start)
);

alter table rate_limits enable row level security;
-- No policy at all: this table is written only by the SECURITY DEFINER function
-- below. Users must not be able to read, reset or forge their own counters.

create index if not exists rate_limits_window_idx on rate_limits (window_start);

/*
 * Consumes one unit of quota for the calling user. Returns true when the call
 * is allowed, false when the limit is exhausted.
 *
 * SECURITY DEFINER so it can write to a table the caller cannot touch, with
 * auth.uid() taken from the session rather than from an argument — a caller
 * cannot spend, inspect or reset anyone else's quota, including their own.
 */
create or replace function consume_rate_limit(
  p_action text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz;
  v_count int;
begin
  if v_user is null then
    return false;  -- unauthenticated callers get no quota
  end if;

  -- Fixed window, bucketed by truncating epoch seconds.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (user_id, action, window_start, count)
  values (v_user, p_action, v_window, 1)
  on conflict (user_id, action, window_start)
    do update set count = rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of windows nothing will read again.
  delete from rate_limits where window_start < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke all on function consume_rate_limit(text, int, int) from public;
grant execute on function consume_rate_limit(text, int, int) to authenticated;

-- ── Document path integrity (H2) ─────────────────────────────────────────────
-- storage_path is written by the browser. RLS validates application_item_id but
-- treats the path as opaque, so a user could point their own row at another
-- user's file. The storage policy blocks the read, but nothing in the database
-- stopped the row existing. This trigger makes the row itself impossible.
create or replace function enforce_document_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_prefix text;
begin
  select a.id || '/' || ai.item_id || '/'
    into v_expected_prefix
  from application_items ai
  join applications a on a.id = ai.application_id
  where ai.id = new.application_item_id;

  if v_expected_prefix is null then
    raise exception 'documents.application_item_id % does not exist', new.application_item_id;
  end if;

  if position(v_expected_prefix in new.storage_path) <> 1 then
    raise exception 'storage_path must begin with %', v_expected_prefix
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_enforce_path on documents;
create trigger documents_enforce_path
  before insert or update of storage_path, application_item_id on documents
  for each row execute function enforce_document_path();


-- ── Rate limiting (H3, H4) ───────────────────────────────────────────────────
-- Per-user counters held in the database rather than in process memory, because
-- serverless instances do not share memory and an in-memory limiter is trivially
-- bypassed by spreading requests across cold starts.
create table if not exists rate_limits (
  user_id      uuid not null references auth.users(id) on delete cascade,
  action       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, action, window_start)
);

alter table rate_limits enable row level security;
-- No policy at all: this table is written only by the SECURITY DEFINER function
-- below. Users must not be able to read, reset or forge their own counters.

create index if not exists rate_limits_window_idx on rate_limits (window_start);

/*
 * Consumes one unit of quota for the calling user. Returns true when the call
 * is allowed, false when the limit is exhausted.
 *
 * SECURITY DEFINER so it can write to a table the caller cannot touch, with
 * auth.uid() taken from the session rather than from an argument — a caller
 * cannot spend, inspect or reset anyone else's quota, including their own.
 */
create or replace function consume_rate_limit(
  p_action text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz;
  v_count int;
begin
  if v_user is null then
    return false;  -- unauthenticated callers get no quota
  end if;

  -- Fixed window, bucketed by truncating epoch seconds.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (user_id, action, window_start, count)
  values (v_user, p_action, v_window, 1)
  on conflict (user_id, action, window_start)
    do update set count = rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of windows nothing will read again.
  delete from rate_limits where window_start < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke all on function consume_rate_limit(text, int, int) from public;
grant execute on function consume_rate_limit(text, int, int) to authenticated;

-- ── Document path integrity (H2) ─────────────────────────────────────────────
-- storage_path is written by the browser. RLS validates application_item_id but
-- treats the path as opaque, so a user could point their own row at another
-- user's file. The storage policy blocks the read, but nothing in the database
-- stopped the row existing. This trigger makes the row itself impossible.
create or replace function enforce_document_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_prefix text;
begin
  select a.id || '/' || ai.item_id || '/'
    into v_expected_prefix
  from application_items ai
  join applications a on a.id = ai.application_id
  where ai.id = new.application_item_id;

  if v_expected_prefix is null then
    raise exception 'documents.application_item_id % does not exist', new.application_item_id;
  end if;

  if position(v_expected_prefix in new.storage_path) <> 1 then
    raise exception 'storage_path must begin with %', v_expected_prefix
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_enforce_path on documents;
create trigger documents_enforce_path
  before insert or update of storage_path, application_item_id on documents
  for each row execute function enforce_document_path();

-- ────────────────────────────────────────────────────────────────────────────
-- End-to-end encryption — user_crypto, document envelope, bucket accepts ciphertext
-- ────────────────────────────────────────────────────────────────────────────
-- ── Bucket: accept ciphertext ────────────────────────────────────────────────
update storage.buckets
set
  public = false,
  file_size_limit = 22020096,  -- 21 MB
  allowed_mime_types = array[
    'application/octet-stream',
    'application/pdf','image/jpeg','image/png','image/gif','image/webp'
  ]
where id = 'visa-documents';

-- ── End-to-end encryption ────────────────────────────────────────────────────
-- Documents are encrypted in the browser before upload. The server stores
-- ciphertext and never sees the passphrase or the key derived from it.
--
-- The salt is public by design: it is not a secret, it only stops one
-- precomputed table working against every user. What protects the documents is
-- the passphrase, which exists nowhere but in the user's head and, for the life
-- of a tab, in memory.
create table if not exists user_crypto (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  salt        text not null,          -- base64, 16 bytes
  iterations  int  not null,          -- PBKDF2 rounds used, so it can be raised later
  verifier_iv text not null,          -- base64
  verifier_ct text not null,          -- base64: known plaintext under the derived key
  created_at  timestamptz not null default now()
);

-- "create table if not exists" does NOTHING when the name is already taken —
-- it does not reconcile columns. A table left over from an earlier shape would
-- silently survive, and the app would fail with 42703 (undefined_column) on a
-- table that plainly exists. So every column is added explicitly as well.
--
-- Added nullable, because a NOT NULL column cannot be added to a table that
-- already has rows. The constraint below then enforces completeness, and any
-- row that predates a column is deleted first: without a salt or iteration
-- count it can derive no key, so it is not data, it is an obstacle.
alter table user_crypto add column if not exists salt text;
alter table user_crypto add column if not exists iterations int;
alter table user_crypto add column if not exists verifier_iv text;
alter table user_crypto add column if not exists verifier_ct text;
alter table user_crypto add column if not exists created_at timestamptz not null default now();

delete from user_crypto
where salt is null or iterations is null
   or verifier_iv is null or verifier_ct is null;

do $$
begin
  execute 'alter table user_crypto alter column salt set not null';
  execute 'alter table user_crypto alter column iterations set not null';
  execute 'alter table user_crypto alter column verifier_iv set not null';
  execute 'alter table user_crypto alter column verifier_ct set not null';
end $$;

alter table user_crypto enable row level security;

drop policy if exists "own crypto - read" on user_crypto;
create policy "own crypto - read" on user_crypto
  for select using (user_id = auth.uid());

drop policy if exists "own crypto - create" on user_crypto;
create policy "own crypto - create" on user_crypto
  for insert with check (user_id = auth.uid());

-- No update or delete policy, deliberately. Replacing the salt would silently
-- make every document already uploaded undecryptable. Changing a passphrase has
-- to mean re-encrypting everything, which is a feature, not an UPDATE.

-- ── Document envelope ────────────────────────────────────────────────────────
alter table documents add column if not exists encrypted boolean not null default false;
alter table documents add column if not exists iv text;  -- base64, per file

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_iv_present'
  ) then
    -- An encrypted row without its IV is unrecoverable data. Refuse to store one.
    alter table documents add constraint documents_iv_present
      check (not encrypted or iv is not null);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Filename blinding — name_cipher / name_iv
-- ────────────────────────────────────────────────────────────────────────────
alter table documents add column if not exists name_cipher text;  -- base64
alter table documents add column if not exists name_iv text;      -- base64

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_name_cipher_present'
  ) then
    -- An encrypted row whose name cannot be decrypted would display as a UUID
    -- forever, so refuse to store one.
    alter table documents add constraint documents_name_cipher_present
      check (not encrypted or (name_cipher is not null and name_iv is not null));
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Crypto state guard — refuse an unusable user_crypto row
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_crypto_complete'
  ) then
    -- The columns are already NOT NULL, so a half-written row cannot exist —
    -- but empty strings would satisfy NOT NULL while being just as useless, and
    -- would present a first-time user with an unlock form that cannot work.
    alter table user_crypto add constraint user_crypto_complete check (
      length(btrim(salt)) > 0
      and length(btrim(verifier_iv)) > 0
      and length(btrim(verifier_ct)) > 0
      and iterations > 0
    );
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- Verify — every row below should match the expectation in its comment.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Bucket: private, 21 MB, and accepting octet-stream (encrypted uploads).
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'visa-documents';

-- 2. RLS enabled on every user table. All should read true.
select relname, relrowsecurity as rls_enabled
from pg_class
where relname in ('applications','application_items','documents','ai_messages',
                  'profiles','rate_limits','user_crypto')
order by relname;

-- 3. user_crypto policies: expect exactly SELECT and INSERT. An UPDATE policy
--    here would let a user replace their salt and strand their own documents.
select policyname, cmd from pg_policies
where tablename = 'user_crypto' order by cmd;

-- 4. Encryption columns on documents. Expect encrypted, iv, name_cipher, name_iv.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'documents'
  and column_name in ('encrypted','iv','name_cipher','name_iv')
order by column_name;

-- 5. Integrity constraints. Expect documents_iv_present,
--    documents_name_cipher_present and user_crypto_complete.
select conname from pg_constraint
where conname in ('documents_iv_present','documents_name_cipher_present',
                  'user_crypto_complete')
order by conname;

-- 6. Functions the app calls. Expect consume_rate_limit and enforce_document_path.
select proname from pg_proc
where proname in ('consume_rate_limit','enforce_document_path','seed_application_items')
order by proname;

-- 7. Expect ZERO rows: no policy on user data may be unconditional.
--    INSERT policies carry their condition in with_check rather than qual, so
--    each is checked against the column it actually uses.
select tablename, policyname, cmd
from pg_policies
where tablename in ('applications','application_items','documents','ai_messages',
                    'profiles','user_crypto')
  and case
        when cmd = 'INSERT' then (with_check is null or with_check = 'true')
        else (qual is null or qual = 'true')
      end;
