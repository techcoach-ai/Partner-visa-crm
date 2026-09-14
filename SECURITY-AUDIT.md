# Security audit — Partner Visa CRM

**Scope:** protection of users' uploaded personal identity documents (passports,
birth certificates, financial records, relationship photographs).
**Date:** 2026-09-14 · **Commit audited:** `9457290`
**Method:** static review of schema, RLS policies, route handlers, server
actions and client components; client bundle inspection; full git history
secret scan. **Not** verified against a live Supabase project — see *Limits*.

## Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 8 | **all fixed** |
| Medium | 7 | 3 fixed, 4 require dashboard settings or accepted |

**No critical findings.** The core isolation model is sound: row-level security
is enabled on all four user tables, every policy scopes through `auth.uid()`,
the bucket is private, and no secret reaches the browser. The high findings are
places where the application layer contributes **no defence of its own** and
relies entirely on the database being configured correctly — if a single policy
were dropped or mis-edited, several would become direct cross-tenant document
exposure with nothing to stop them.

---

## What passed

**1. RLS enablement and scoping — PASS.** All four user tables carry
`enable row level security`, plus `profiles`. No `using (true)` on any user
table. Policies scope correctly:

| Table | Scoping |
|---|---|
| `applications` | `owner_id = auth.uid()` |
| `application_items` | `exists(... applications a where a.id = application_id and a.owner_id = auth.uid())` |
| `documents` | joins `application_items` → `applications`, owner check |
| `ai_messages` | via `applications.owner_id` |
| `profiles` | `id = auth.uid()`, **select only** — no write policy, so the acceptance timestamp is immutable to the user |

`checklist_categories` / `checklist_items` are `for select using (true)` — correct,
they are global non-sensitive reference data with no write policy, so they are
read-only to both `anon` and `authenticated`.

**2. Bucket privacy — PASS.** `visa-documents` is created with `public = false`.
The `storage.objects` policy constrains **both** read and write (`for all`, with
matching `using` and `with check`) to objects whose first path segment is an
application owned by the caller.

**3. Service-role key containment — PASS.** Three usages, all legitimate:

| Location | Context | Verdict |
|---|---|---|
| `lib/supabase/admin.ts` | factory, server module | OK |
| `app/api/account/delete/route.ts` | route handler | OK |
| `scripts/seed.ts` | standalone Node CLI, never bundled | OK |

Never `NEXT_PUBLIC_`. Client bundle grepped: no `service_role` and no
`ANTHROPIC_API_KEY` in any chunk under `.next/static`.

**5. Signed URLs — PASS.** 60-second expiry, `createSignedUrl` only.
`getPublicUrl` appears nowhere. No `console.*` logging anywhere in app code, so
no URL, path or token is written to logs.

**9. Secrets in git — PASS.** All 11 commits scanned for API-key and JWT-shaped
strings: clean. `.gitignore` has `.env*` with `!.env.example`; the only tracked
env file is `.env.example`, which contains placeholders.

---

## High

### H1 — Upload validation is client-side only; bucket accepts any type and any size
`app/(app)/checklist/[entryId]/item-detail.tsx` (client component) checks
`file.size > MAX_UPLOAD_BYTES` and passes `contentType`. That is the **only**
check. `storage.buckets` has neither `allowed_mime_types` nor `file_size_limit`.

Every user holds the anon key and a valid session, so
`supabase.storage.from('visa-documents').upload(...)` can be called directly
from a console with any payload. The storage policy checks the *path* only —
never type or size. A user can store arbitrary executables, or exhaust storage
quota and cost, inside their own folder.

### H2 — `storage_path` is client-supplied and never validated server-side
The `documents` row is inserted **from the browser** with a `storage_path` the
client chose. RLS validates `application_item_id` ownership but treats
`storage_path` as opaque.

A user can therefore insert a row they own that points at
`{victim_application_id}/.../passport.pdf`, then call
`/api/documents/{id}/signed-url` or `/review`. Both route handlers pass
`doc.storage_path` straight to Storage.

Today this is **blocked**, but only by the `storage.objects` policy refusing the
read. The application performs no check at all. This is the exact pattern the
brief warns against — trusting an identifier from the client — and it is one
policy edit away from being direct cross-tenant document theft.

### H3 — No rate limiting on the AI routes
`/api/documents/[id]/review`, `/api/readiness`, `/api/assistant` and
`/api/drafter` each call the Anthropic API with no per-user throttle. A signed-in
user can loop `review` on one document indefinitely. `drafter` allows a 12,000
character input at `max_tokens: 8000`. This is unbounded, attributable spend on
your key, and `maxDuration` up to 120s per call also ties up functions.

### H4 — No application-level rate limiting on authentication
Signup and login call `supabase.auth` directly from the browser with no
throttle. Supabase applies its own limits, but the application adds none and
does not surface lockout.

### H5 — `lib/supabase/admin.ts` has no `server-only` guard
`lib/ai.ts`, `lib/queries.ts` and `lib/ai-context.ts` all import `server-only`.
The module that reads `SUPABASE_SERVICE_ROLE_KEY` does not, nor does
`lib/supabase/server.ts`. Nothing today imports them from a client component, so
there is no live leak — but the one module whose accidental client import would
be catastrophic is the one lacking the guard that turns it into a build error.

### H6 — Checklist server actions do not authenticate and cannot detect denial
`app/(app)/checklist/actions.ts` — `setItemStatus`, `setItemNotes`,
`deleteDocument` — call `createClient()` and rely on RLS alone. Its own comment
says "no ownership check needed here."

Server Actions are publicly reachable POST endpoints. Two consequences:

- No `getUser()`, so an unauthenticated invocation is not rejected by the
  application; it reaches the database and is denied there.
- A PostgREST `update` matching **zero** rows returns no error. When RLS denies
  the write, the action returns `{}` — indistinguishable from success. The
  caller is told the change was saved when it was not.

### H7 — `storage.objects` RLS is never explicitly enabled
`schema.sql` creates the storage policy but never runs
`alter table storage.objects enable row level security`. Supabase enables it by
default, so this is correct **on a standard project** — but the schema is
presented as a complete, paste-once setup. If the default ever differs, the
policy exists and is silently inert, and the entire bucket becomes readable by
any authenticated user. A one-line assertion removes the assumption.

### H8 — Account deletion can orphan documents
`app/api/account/delete/route.ts` lists storage with `limit: 1000` at both
levels and never paginates, and ignores the list call's error (destructured
`data` only). If listing fails or a user exceeds the page size, `paths` is short
or empty, the auth user is deleted anyway, and the remaining files persist in the
bucket with **no database row referencing them** — unreachable, undeletable
through the UI, and contrary to the deletion promise in `/privacy`.

---

## Medium

### M1 — Password minimum enforced only in the browser
`minLength={8}` and a length check in `signup-form.tsx`. Direct
`supabase.auth.signUp` calls bypass both; the real floor is the Supabase project
setting (default 6).
**Action: set the minimum to 8+ in Supabase → Authentication → Policies.**

### M2 — Email confirmation state is unverified
The signup handler correctly branches on `!data.session` ("check your email"),
which is the right behaviour whether or not confirmation is on. Whether it *is*
on is a dashboard setting not visible from the repo.
**Action: confirm Authentication → Providers → Email → "Confirm email" is ON.**

### M3 — `size_bytes` and `mime_type` are client-supplied
The review route's pre-download size guard reads `doc.size_bytes` from the row,
which the client wrote. Lying about it skips that check. Mitigated: the route
re-checks `bytes.byteLength` after download, which is authoritative, and that
second check is what actually protects the Anthropic request.

### M4 — API responses carrying a signed URL are cacheable
`/api/documents/[id]/signed-url` returns the URL with no `Cache-Control`.
A shared cache or proxy could retain it for its 60-second life.

### M5 — Raw database errors are returned to the client
Several handlers return `error.message` verbatim, which can disclose column and
constraint names. Low value to an attacker given RLS holds, but free to avoid.

### M6 — Tables do not `force row level security`
Table owners bypass RLS. On Supabase the API roles (`anon`, `authenticated`) are
not owners, so this is correct as deployed; noted so it is not assumed.

### M7 — `seed_application_items(app_id)` accepts any application id
It is `language sql` without `security definer`, so it executes as the caller and
its insert is denied by RLS for an application the caller does not own. Safe as
written, and noted so that adding `security definer` later — which would look
like a harmless fix — must not happen without an explicit ownership check.

---

## Limits of this audit

Static only. Not verified: that RLS behaves as written against a live Supabase
instance, that the storage policy denies a cross-tenant `createSignedUrl`, or
that the dashboard settings in M1/M2 are set. The two-account isolation test in
the README remains the decisive check and has not been run.


---

## Fixes applied

Commit following this report. Nothing was weakened to make a feature work; every
change adds a check.

| # | Fix | Where |
|---|---|---|
| H1 | `file_size_limit` (20 MB) and `allowed_mime_types` set on the bucket, so Storage rejects a bad upload even when the browser is bypassed. Client limits moved to a shared module so the two cannot drift. | `schema.sql`, `lib/storage.ts`, `item-detail.tsx` |
| H2 | `documents` rows are now written by a server action that verifies `storage_path` begins with `{application_id}/{item_id}/` for an item the caller owns. A database trigger enforces the same rule independently, covering `insert` **and** `update of storage_path`. The client no longer writes the table. | `checklist/actions.ts`, `schema.sql`, `item-detail.tsx` |
| H3 | Per-user rate limits on all four AI routes, counted in the database via a `SECURITY DEFINER` function reading `auth.uid()`. Review 20/h, readiness 20/h, assistant 60/h, drafter 10/h. Fails **closed**. | `lib/rate-limit.ts`, four routes, `schema.sql` |
| H4 | Account deletion rate-limited (5/h). Auth throttling itself remains Supabase's — see M1. | `account/delete/route.ts` |
| H5 | `import 'server-only'` added to `lib/supabase/admin.ts` and `lib/supabase/server.ts`, so an accidental client import becomes a build error instead of a leaked key. | `lib/supabase/*.ts` |
| H6 | All checklist server actions now call `getUser()`, load the row to prove ownership, and `.select()` after every write so a zero-row RLS denial is reported as failure instead of success. | `checklist/actions.ts` |
| H7 | `alter table storage.objects enable row level security` added, so the bucket policy can never be silently inert. | `schema.sql` |
| H8 | Deletion now paginates both directory levels, throws on a list error instead of ignoring it, removes in batches, and **re-lists to confirm the prefix is empty before deleting the account**. If anything survives, the account is kept and the user is told — an orphaned identity document is worse than a retryable failure. | `account/delete/route.ts` |
| M4 | `Cache-Control: no-store` on the signed-URL response. | `signed-url/route.ts` |
| M5 | Database error strings no longer returned to the client from the checklist actions. | `checklist/actions.ts` |
| — | Filenames sanitised before becoming object keys (separators and leading dots stripped, length capped). | `lib/storage.ts` |

### Verified against PostgreSQL 16

Not asserted by inspection. A throwaway cluster was built with the Supabase
objects stubbed, `schema.sql` applied, and the fixes exercised:

| Test | Result |
|---|---|
| Document row with a valid own-item path | accepted |
| Path pointing at another user's application | **rejected** |
| Path with the right application but the wrong item | **rejected** |
| `../` traversal in the path | **rejected** |
| `UPDATE` moving a valid row to a foreign path | **rejected** |
| Rate limit, limit 3 | `t,t,t,f,f` |
| Second action for the same user | independent budget |
| Second user after the first is exhausted | unaffected |
| Unauthenticated caller | no quota |
| User reading or resetting their own counter | `ERROR: permission denied for table rate_limits` |
| RLS on all 8 tables | `true` |
| Bucket | private, 20 MB, 5 MIME types |

Client bundle re-grepped after build: no `service_role`, no `ANTHROPIC_API_KEY`.

## Still yours to do

These cannot be fixed from the repository:

1. **Run `migrations/2026-09-14-security-hardening.sql`** on your Supabase
   project — it carries H1, H2, H3 and H7. Its verification queries must return
   a private bucket with both limits, `rls_enabled = true` on all six tables,
   one `documents_enforce_path` trigger, and **zero rows** from the
   unconditional-policy check.
2. **M1** — set the password minimum to 8+ in Authentication → Policies. The
   browser check is not a control.
3. **M2** — confirm "Confirm email" is ON in Authentication → Providers → Email.
4. **The two-account isolation test** in the README remains the decisive
   verification and has still not been run against a live database.


---

## Addendum — end-to-end encryption (2026-09-14)

Documents are now encrypted in the browser before upload. This changes the
threat model materially: a compromise of the database or the storage bucket
yields ciphertext, and the passphrase that unlocks it exists nowhere on the
server. Several findings above are strengthened as a result — a leaked signed
URL now yields an encrypted blob rather than a passport scan.

Properties, and their limits:

| | |
|---|---|
| Key derivation | PBKDF2-SHA256, 250,000 iterations, per-user 16-byte random salt |
| Cipher | AES-GCM 256, fresh 12-byte IV per file, authenticated |
| Key handling | derived **non-extractable**; held in React state for the tab only; never in localStorage, sessionStorage or IndexedDB, so never on disk |
| Server knowledge | salt, IV, filename, MIME type, plaintext size, and the ciphertext |
| Recovery | none, by design — a lost passphrase means unrecoverable uploads |

**`user_crypto` is append-only.** Select and insert policies, no update policy.
Verified with grants in place so RLS is what blocks it, not a missing GRANT: a
user reads their own row, `UPDATE` and `DELETE` affect zero rows, and a second
user sees none. Without this, replacing a salt would silently strand every
document already uploaded.

**Two of the security fixes above would have broken this**, and were corrected
in the same change: the bucket's `allowed_mime_types` had to admit
`application/octet-stream` (ciphertext has no meaningful type), and its 20 MB
ceiling had to rise to 21 MB because AES-GCM appends a 16-byte tag, so an
exactly-20 MB file would have been rejected.

### Accepted consequences

- **The server cannot verify that reviewed bytes match stored bytes.** Only the
  passphrase holder can decrypt, and they are the one posting. The review is
  advisory and attaches to a row the caller already owns, so this buys an
  attacker nothing but a review of their own file. Inherent to E2E, not a defect.
- **AI review is capped at 3 MB of plaintext**, because the browser must now post
  the file and serverless bodies are limited. Uploads remain 20 MB.
- **Metadata is not encrypted.** Filenames, MIME types and sizes are readable
  server-side. A filename like `passport-scan.pdf` still leaks its subject.
- **This does not defend against a compromised client.** Code served by the app
  could capture the passphrase. E2E encryption protects data at rest on the
  server; it does not protect against the server serving hostile JavaScript.

### Verified

`npm run verify:crypto` — 14 assertions against Node's Web Crypto, the same
SubtleCrypto the browser implements: key is non-extractable, ciphertext is
plaintext + 16-byte tag, round-trip is byte-exact, base64 survives a payload
larger than the chunk boundary, a wrong passphrase is **rejected rather than
silently wrong**, the same passphrase with a different salt cannot decrypt,
tampered ciphertext fails the auth tag, the verifier accepts the right key and
rejects the wrong one, and a fresh IV is used per file.

Database behaviour verified on PostgreSQL 16: an encrypted row without its IV is
rejected by `documents_iv_present`, legacy plaintext rows still insert, and the
migration applies cleanly over the previous schema.
