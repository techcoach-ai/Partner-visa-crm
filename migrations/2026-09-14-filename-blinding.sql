-- Filename blinding migration
--
-- Run after 2026-09-14-e2e-encryption.sql. Idempotent, and a no-op on a
-- database that already has these columns.
--
-- Encrypted documents previously stored the real filename and MIME type in
-- clear, so a row could announce its own contents — "passport-scan.pdf,
-- application/pdf" tells you everything the encryption was meant to hide.
--
-- From now on, for encrypted rows only:
--   file_name    a random UUID, which is also the storage object name
--   mime_type    'application/octet-stream'
--   name_cipher  the real display name, encrypted under the user's key
--   name_iv      that name's IV
--
-- Rows with encrypted = false are untouched and keep rendering from file_name.

begin;

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

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect both columns, text and nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'documents' and column_name in ('name_cipher','name_iv')
order by column_name;

-- Expect both constraints.
select conname from pg_constraint
where conname in ('documents_iv_present','documents_name_cipher_present')
order by conname;

-- Expect zero rows. Any encrypted document still carrying a real-looking
-- filename or MIME type predates this migration and should be re-uploaded —
-- its name is already known to the server and cannot be un-known.
select id, file_name, mime_type
from documents
where encrypted
  and (name_cipher is null or mime_type <> 'application/octet-stream');
