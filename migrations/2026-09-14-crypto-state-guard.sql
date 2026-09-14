-- Guard against an unusable user_crypto row
--
-- Run after 2026-09-14-e2e-encryption.sql. Idempotent.
--
-- The four columns are already NOT NULL, so a genuinely half-written row cannot
-- exist. Empty strings, though, satisfy NOT NULL while being just as unusable:
-- a row with salt = '' would classify as "set up", and the user would be shown
-- an unlock form that can never succeed. This makes that state unstorable.

begin;

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

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect one row.
select conname from pg_constraint where conname = 'user_crypto_complete';

-- Expect zero rows. Anything here predates the constraint and should be deleted
-- so the owner can set a passphrase again; nothing was encrypted under it.
select user_id
from user_crypto
where length(btrim(salt)) = 0
   or length(btrim(verifier_iv)) = 0
   or length(btrim(verifier_ct)) = 0
   or iterations <= 0;
