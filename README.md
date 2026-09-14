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
2. `seed.sql` — the 12 checklist categories and 42 items. Idempotent.

If you seeded this database before 2026-09-14, also run
`migrations/2026-09-14-offshore-309-100.sql`. `seed.sql` only inserts items
whose title is absent, so re-running it will not rewrite the items that changed
when the app moved from the onshore 820/801 to the offshore 309/100 — it would
add the new ones alongside the old.

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

## Isolation

Every table has row-level security keyed to `auth.uid()`, and the storage bucket
enforces the same rule on the file path (`{application_id}/{item_id}/{filename}`).
Application queries use the anon key under the user's own session, so the
database is the isolation boundary rather than application logic. The
service-role key is used in exactly one place — deleting an auth user during
account deletion.

Documents are served only through short-lived signed URLs. The bucket is private
and has no public URLs.
