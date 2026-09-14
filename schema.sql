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
insert into storage.buckets (id, name, public)
values ('visa-documents', 'visa-documents', false)
on conflict (id) do nothing;

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
