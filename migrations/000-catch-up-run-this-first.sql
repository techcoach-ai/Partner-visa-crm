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

-- H7: never assume the platform default. If RLS were off, the policy below
-- would exist and be silently inert, exposing every document in the bucket.
alter table storage.objects enable row level security;


-- H7: never assume the platform default. If RLS were off, the bucket policy
-- would exist and be silently inert.
alter table storage.objects enable row level security;

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
