-- Partner Visa CRM — Supabase schema
-- Stack: Next.js 14 / Supabase (Auth + Storage + RLS) / Anthropic API
-- Single-owner-per-application model. All access scoped to auth.uid().

-- ── Enums ─────────────────────────────────────────────────────────────────
create type item_status as enum ('not_started','in_progress','uploaded','verified','not_applicable');
create type applies_to  as enum ('applicant','sponsor','couple');
create type ai_verdict  as enum ('pending','satisfies','partial','insufficient','error');

-- ── Applications ──────────────────────────────────────────────────────────
create table applications (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  subclass          text not null default '309/100',
  relationship_basis text not null default 'de_facto',
  applicant_name    text,
  sponsor_name      text,
  target_lodge_date date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Checklist template (global, seeded from partner-visa-checklist-seed.json)
create table checklist_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  pillar      text,                       -- financial | household | social | commitment | null
  description text,
  sort_order  int not null default 0
);

create table checklist_items (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references checklist_categories(id) on delete cascade,
  title          text not null,
  description    text,
  applies_to     applies_to not null default 'couple',
  required       boolean not null default true,
  form_reference text,                    -- e.g. 'Form 888', 'Form 40SP'
  guidance       text,
  sort_order     int not null default 0
);

-- ── Per-application progress ──────────────────────────────────────────────
create table application_items (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  item_id        uuid not null references checklist_items(id) on delete cascade,
  status         item_status not null default 'not_started',
  notes          text,
  updated_at     timestamptz not null default now(),
  unique (application_id, item_id)
);

-- ── Documents (files live in Supabase Storage; this row is the metadata) ──
create table documents (
  id                  uuid primary key default gen_random_uuid(),
  application_item_id uuid not null references application_items(id) on delete cascade,
  storage_path        text not null,      -- bucket path: {application_id}/{item_id}/{filename}
  file_name           text not null,
  mime_type           text,
  size_bytes          bigint,
  ai_verdict          ai_verdict default 'pending',
  ai_notes            text,               -- AI review commentary
  uploaded_at         timestamptz not null default now()
);

-- ── AI conversations (grounded Q&A assistant) ─────────────────────────────
create table ai_messages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  role           text not null,           -- 'user' | 'assistant'
  content        text not null,
  created_at     timestamptz not null default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────
alter table applications      enable row level security;
alter table application_items enable row level security;
alter table documents         enable row level security;
alter table ai_messages       enable row level security;
-- Template tables are read-only reference data:
alter table checklist_categories enable row level security;
alter table checklist_items      enable row level security;

create policy "own applications" on applications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own application_items" on application_items
  for all using (exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid()));

create policy "own documents" on documents
  for all using (exists (
    select 1 from application_items ai
    join applications a on a.id = ai.application_id
    where ai.id = application_item_id and a.owner_id = auth.uid()))
  with check (exists (
    select 1 from application_items ai
    join applications a on a.id = ai.application_id
    where ai.id = application_item_id and a.owner_id = auth.uid()));

create policy "own ai_messages" on ai_messages
  for all using (exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid()));

create policy "read templates - categories" on checklist_categories for select using (true);
create policy "read templates - items"      on checklist_items      for select using (true);

-- ── Storage bucket + RLS (runs here — no dashboard/terminal needed) ───────
-- Size and MIME limits are set on the bucket so Storage enforces them itself.
-- The browser also checks, but that check is advisory: every user holds the
-- anon key and can call the storage API directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visa-documents', 'visa-documents', false,
  -- 21 MB: the plaintext cap is 20 MB, and AES-GCM appends a 16-byte
  -- authentication tag, so an exactly-20 MB file would fail a 20 MB ceiling.
  22020096,
  -- application/octet-stream is what an encrypted upload is: opaque bytes. The
  -- real type is kept in documents.mime_type, which describes the plaintext.
  array[
    'application/octet-stream',
    'application/pdf','image/jpeg','image/png','image/gif','image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- H7: never assume the platform default. If RLS were off, the policy below
-- would exist and be silently inert, exposing every document in the bucket.
alter table storage.objects enable row level security;

-- Path convention: {application_id}/{item_id}/{filename}
-- First folder segment = application_id, which must be owned by the user.
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
  );

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

-- Filename blinding. For an encrypted document, file_name holds a random UUID
-- and mime_type holds 'application/octet-stream', so the server learns nothing
-- from the row: a file called passport-scan.pdf would otherwise announce its own
-- contents. The real display name is encrypted under the same session key.
alter table documents add column if not exists name_cipher text;  -- base64
alter table documents add column if not exists name_iv text;      -- base64

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_iv_present'
  ) then
    -- An encrypted row without its IV is unrecoverable data. Refuse to store one.
    alter table documents add constraint documents_iv_present
      check (not encrypted or iv is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_name_cipher_present'
  ) then
    -- Same reasoning for the blinded name: an encrypted row whose name cannot be
    -- decrypted would display as a UUID forever.
    alter table documents add constraint documents_name_cipher_present
      check (not encrypted or (name_cipher is not null and name_iv is not null));
  end if;
end $$;
