-- ════════════════════════════════════════════════════════════════════════════
-- Repair user_crypto
--
-- Symptom: [42703] column user_crypto.iterations does not exist
--
-- Cause: the table already existed in some earlier shape, and
-- "create table if not exists" does nothing at all when the name is taken —
-- it does not reconcile columns. So the table was left as it was.
--
-- This rebuilds it to the shape the app expects. It refuses to run if any
-- document is already encrypted, because the salt in this table is the only
-- thing that can derive the key for those files.
-- ════════════════════════════════════════════════════════════════════════════

-- What is actually there right now (for the record).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'user_crypto'
order by ordinal_position;

begin;

do $$
declare
  v_encrypted int := 0;
  v_rows int := 0;
begin
  -- Safety: never drop the salt while anything depends on it.
  if to_regclass('public.documents') is not null then
    execute 'select count(*) from documents where encrypted' into v_encrypted;
  end if;

  if v_encrypted > 0 then
    raise exception
      'REFUSING TO CONTINUE: % encrypted document(s) exist. Dropping user_crypto would make them permanently unreadable. Nothing has been changed.',
      v_encrypted;
  end if;

  if to_regclass('public.user_crypto') is not null then
    execute 'select count(*) from user_crypto' into v_rows;
    raise notice 'Existing user_crypto had % row(s); no encrypted documents, so it is safe to rebuild.', v_rows;
  end if;

  drop table if exists public.user_crypto cascade;
end $$;

create table public.user_crypto (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  salt        text not null,          -- base64, 16 bytes
  iterations  int  not null,          -- PBKDF2 rounds, so they can be raised later
  verifier_iv text not null,          -- base64
  verifier_ct text not null,          -- base64: known plaintext under the derived key
  created_at  timestamptz not null default now(),
  constraint user_crypto_complete check (
    length(btrim(salt)) > 0
    and length(btrim(verifier_iv)) > 0
    and length(btrim(verifier_ct)) > 0
    and iterations > 0
  )
);

alter table public.user_crypto enable row level security;

create policy "own crypto - read" on public.user_crypto
  for select using (user_id = auth.uid());

create policy "own crypto - create" on public.user_crypto
  for insert with check (user_id = auth.uid());

-- No update or delete policy: replacing a salt would strand every document
-- already encrypted under the old one.

grant usage on schema public to anon, authenticated;
grant select, insert on public.user_crypto to authenticated;

commit;

-- Make the API pick up the new shape immediately.
notify pgrst, 'reload schema';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect exactly: user_id, salt, iterations, verifier_iv, verifier_ct, created_at
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'user_crypto'
order by ordinal_position;

-- Expect SELECT and INSERT only.
select policyname, cmd from pg_policies
where tablename = 'user_crypto' order by cmd;

-- Expect true, true.
select has_table_privilege('authenticated','public.user_crypto','SELECT') as auth_select,
       has_table_privilege('authenticated','public.user_crypto','INSERT') as auth_insert;
