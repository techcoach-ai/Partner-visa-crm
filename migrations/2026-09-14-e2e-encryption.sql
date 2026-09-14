-- End-to-end encryption migration
--
-- Run on an existing database after schema.sql, seed.sql and the earlier
-- migrations. Idempotent, and a no-op on a database that already has it.
--
-- Adds:
--   user_crypto        per-user PBKDF2 salt + verifier. The salt is public; the
--                      passphrase and derived key never reach the server.
--   documents.encrypted / documents.iv
--                      the AES-GCM envelope. Rows written before this migration
--                      keep encrypted = false and continue to work unchanged.
--   bucket changes     application/octet-stream is what ciphertext is, and the
--                      size ceiling rises to 21 MB because AES-GCM appends a
--                      16-byte tag — an exactly-20 MB file would otherwise be
--                      rejected by a 20 MB limit.

begin;

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

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Bucket must accept octet-stream and allow room for the GCM tag.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'visa-documents';

-- user_crypto: RLS on, select + insert only. An UPDATE policy here would let a
-- user replace their salt and silently strand every document they had uploaded.
select policyname, cmd from pg_policies where tablename = 'user_crypto' order by cmd;

-- Expect encrypted (boolean, not null, default false) and iv (text, nullable).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'documents' and column_name in ('encrypted','iv')
order by column_name;

-- Expect one row: the constraint refusing an encrypted document with no IV.
select conname from pg_constraint where conname = 'documents_iv_present';
