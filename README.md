# Partner Visa CRM — Australian subclass 309/100 (offshore, de facto)

Assembles an Australian **offshore** de facto partner visa application —
subclass 309 (temporary) leading to 100 (permanent). Turns the official
requirements into a tracked checklist, stores evidence against each
requirement, and gates the application until it is decision-ready.

The applicant must be outside Australia when the 309 is lodged and when it is
granted, and no bridging visa is issued while it is processed.

**This tool organises documents. It is not migration advice.** Verify everything
against [immi.homeaffairs.gov.au](https://immi.homeaffairs.gov.au) and consider a
MARA-registered migration agent for anything non-standard.

## Stack

Next.js 14 (App Router, TypeScript) · Tailwind + shadcn/ui · Supabase
(Auth + Postgres + Storage + RLS) · Anthropic API · Vercel.

## Setup

### 1. Database

In the Supabase SQL editor, run in order:

1. `schema.sql` — tables, enums, RLS policies, the private `visa-documents`
   bucket and its owner-scoped storage policy, the `profiles` table and its
   signup trigger, indexes, and `seed_application_items()`.
2. `seed.sql` — the 12 checklist categories and 41 items. Idempotent.
3. `migrations/2026-09-14-security-hardening.sql` — bucket limits, the
   document path trigger, rate limiting, storage RLS.
4. `migrations/2026-09-14-e2e-encryption.sql` — the `user_crypto` table and the
   document encryption envelope.
5. `migrations/2026-09-14-filename-blinding.sql` — `name_cipher` / `name_iv`.
6. If this database was seeded with any earlier version of `seed.sql`, also run
   `migrations/2026-09-14-offshore-309-100.sql`. `seed.sql` only inserts
   items whose title is absent, so re-running it will not rewrite items that
   changed — it would add the new ones alongside the stale ones. The migration
   reconciles them by renaming in place, so checklist statuses and uploaded
   documents survive. It is idempotent and a no-op on a current database.

Then under **Authentication → URL Configuration**, set the Site URL and add your
deployed domains to the redirect allow-list.

`scripts/seed.ts` (`npm run seed`) is an optional Node alternative to `seed.sql`;
you do not need both.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in. In Vercel, set the same five
variables for Production, Preview and Development.

| Variable | Exposure |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** |
| `ANTHROPIC_API_KEY` | **server only** |
| `NEXT_PUBLIC_SITE_URL` | browser |

### 3. Run

```bash
npm install
npm run dev
```

## How it fits together

| Path | Purpose |
| --- | --- |
| `app/(app)/dashboard` | Four-pillar gauges, readiness gate, AI gap analysis |
| `app/(app)/checklist` | Checklist by category; item detail with upload and review |
| `app/(app)/documents` | Every uploaded document in one place |
| `app/(app)/assistant` | Q&A grounded in the user's own checklist |
| `app/(app)/drafter` | Statement drafter |
| `app/(app)/settings` | Account details and deletion |
| `app/api/*` | Server-only routes; the Anthropic key never reaches the browser |
| `lib/readiness.ts` | The readiness gate |
| `lib/supabase/*` | Server, browser, middleware and service-role clients |

## The readiness gate

An application is **decision-ready** only when:

- every one of the four pillars has at least one item with status `verified`, and
- every `required` item is `uploaded`, `verified` or `not_applicable`.

`not_applicable` counts as done by design — a couple with no children should not
be blocked by the children item.

## Document encryption

Uploaded documents are encrypted in the browser before they leave the device.

- A 256-bit AES-GCM key is derived from the user's passphrase with PBKDF2-SHA256
  at 250,000 iterations, using a per-user random salt held in `user_crypto`.
- The key is derived **non-extractable** and lives in memory for the tab only.
  It is never written to `localStorage`, `sessionStorage` or IndexedDB, so it
  never touches disk. Closing the tab locks the documents again.
- The passphrase and the key are never sent to the server. The salt is public —
  it stops one precomputed table working against every user and reveals nothing
  on its own.
- Each file gets a fresh 12-byte IV. Only ciphertext is uploaded.
- **Filenames and types are blinded.** For an encrypted document the storage
  object is named with a random UUID, `file_name` holds that same UUID and
  `mime_type` holds `application/octet-stream`. The real display name is
  encrypted under the same key into `name_cipher` / `name_iv`, and the real type
  is recovered in the browser from the decrypted name. A file called
  `passport-scan.pdf` would otherwise have announced its own contents to anyone
  reading a row, a bucket listing or a log line.
- While locked, the UI shows *"Encrypted document"* — never the UUID. Search
  runs over decrypted names.
- `size_bytes` is still the plaintext length, so sizes display honestly.

**If the passphrase is lost, the uploaded copies cannot be recovered by anyone,
including us.** That is the point of the design, and the setup screen requires
the user to acknowledge it. Keep your originals.

`user_crypto` has select and insert policies but deliberately **no update
policy**: replacing a salt would silently strand every document already
uploaded. Changing a passphrase has to mean re-encrypting everything.

### AI review under encryption

The review route can no longer read files from storage, because storage only
holds ciphertext. Instead the browser decrypts locally and posts the plaintext
to `/api/documents/[id]/review`, which forwards it to the Anthropic API in
memory and saves only `ai_verdict` and `ai_notes`. The plaintext is never
written to storage, disk or logs.

Two consequences worth knowing:

- Review is capped at **3 MB of plaintext** because serverless request bodies
  are limited and base64 inflates by a third. Uploads are still 20 MB — larger
  files store and open normally, they just cannot be reviewed automatically.
- The server cannot verify that the bytes it reviews are the bytes in storage.
  Only the passphrase holder could, and they are the one sending them. The
  review is advisory and attached to a row the caller already owns.

The statement drafter and Q&A assistant are unchanged — they never handled files.

## Isolation

Every table has row-level security keyed to `auth.uid()`, and the storage bucket
enforces the same rule on the file path (`{application_id}/{item_id}/{filename}`).
Application queries use the anon key under the user's own session, so the
database is the isolation boundary rather than application logic. The
service-role key is used in exactly one place — deleting an auth user during
account deletion.

Documents are served only through short-lived signed URLs. The bucket is private
and has no public URLs.
