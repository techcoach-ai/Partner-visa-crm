-- Security hardening migration (see SECURITY-AUDIT.md)
--
-- Run this on an existing database after schema.sql and seed.sql. It applies
-- the fixes for the high findings that live in the database:
--
--   H1  bucket file_size_limit + allowed_mime_types, so Storage rejects an
--       oversized or wrong-typed upload even when the browser is bypassed
--   H2  a trigger pinning documents.storage_path to the folder of the item it
--       belongs to, so a row can never point at another user's file
--   H3  a per-user rate limit table and SECURITY DEFINER function
--   H7  storage.objects RLS asserted rather than assumed
--
-- Idempotent: safe to run more than once, and a no-op on a current database.

begin;

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

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Bucket must be private with both limits set.
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id = 'visa-documents';

-- Every one of these must show rowsecurity = true.
select relname, relrowsecurity as rls_enabled
from pg_class
where relname in ('applications','application_items','documents','ai_messages',
                  'profiles','rate_limits')
order by relname;

-- Expect one row: the path trigger.
select tgname from pg_trigger where tgname = 'documents_enforce_path';

-- Expect zero rows: no policy on user data may be unconditional.
select schemaname, tablename, policyname, qual
from pg_policies
where tablename in ('applications','application_items','documents','ai_messages','profiles')
  and (qual is null or qual = 'true');
