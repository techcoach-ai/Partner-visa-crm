# Build brief — Partner Visa CRM (Australia 820/801, de facto)

A CRM to assemble an Australian onshore de facto partner visa (subclass 820 → 801). It turns the official requirements into a tracked checklist, stores evidence against each requirement, and uses the Anthropic API to review documents, draft statements, and gate the application until it's "decision-ready".

**Build it standalone and multi-tenant from day one** — its own repo, its own Vercel project, self-serve signup — so it works for me now and can be offered to other applicants later without re-architecting. The data model is already owner-scoped (RLS on `auth.uid()`), so "offer-ready" is mostly signup + onboarding + the deploy pipeline, not new tables.

## Stack
Next.js 14 (App Router, TS) · Tailwind + shadcn/ui · Supabase (Auth + Postgres + Storage + RLS) · Vercel (Git integration, auto-deploy) · Anthropic API. Same conventions as my other builds.

## Repo & deployment (standalone, auto-deploy)
1. New standalone repo (not folded into an existing project). `git init`, sensible `.gitignore` (`.env*`, `.next`, `node_modules`), initial commit, push to a new GitHub repo.
2. Create a **new Vercel project** and connect it to the repo via Git integration so **every push to `main` auto-deploys to production** and PRs get preview URLs. (CC can do this with the `vercel` CLI: `vercel link` → `vercel git connect`, or I have the Vercel connector available.)
3. Add env vars in Vercel for Production + Preview + Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only — seeding/admin)
   - `ANTHROPIC_API_KEY` (server only)
   - `NEXT_PUBLIC_SITE_URL` (for Supabase auth redirect URLs)
4. Commit `.env.example` documenting all of the above. Never commit real keys.
5. Add the deployed domain(s) to Supabase Auth → URL config (Site URL + redirect allow-list).

## Setup order
1. Run `schema.sql` in the Supabase SQL editor (creates tables, RLS, the private `visa-documents` bucket, and its storage policy — all in one paste).
2. Run `seed.sql` in the Supabase SQL editor to load categories + items (idempotent; safe to re-run). This replaces the Node seed script for a terminal-free setup — `seed.ts` is kept only as an optional alternative.
3. Env vars are set in the Vercel dashboard (see below).
4. On new application creation, call `seed_application_items(app_id)` to instantiate the checklist.
5. **Auth & onboarding (offer-ready):** Supabase Auth email/password (magic link optional). On first sign-in, run onboarding — capture applicant/sponsor names + target lodge date, create the user's `applications` row, and seed their checklist. Every user is fully isolated by RLS; no shared data. A signed-out landing page explains what the tool does and routes to sign up / log in.

## Core screens
- **Dashboard** — four-pillar progress (Financial / Household / Social / Commitment) as gauges, plus admin categories (identity, sponsorship, health, character, lodgement). A prominent **Readiness gate**: "Not decision-ready" until every pillar has ≥1 verified item and all `required` items are `uploaded`/`verified`/`not_applicable`. Surface the AUD 11,710 non-refundable fee and the April 2026 "decision-ready" warning here.
- **Checklist** — grouped by category (sort_order). Each item shows title, guidance, `applies_to` badge, `form_reference` chip, status, and its documents. Status is user-settable; uploading a doc auto-moves `not_started → uploaded`.
- **Item detail / upload** — drag-drop into `visa-documents/{application_id}/{item_id}/`, write a `documents` row, then trigger AI review.
- **AI assistant** — chat grounded in the checklist + `visa.key_rules`; persists to `ai_messages`.
- **Statement drafter** — form for relationship timeline → AI drafts applicant & sponsor personal statements (editable, never auto-submitted).

## AI integration (Anthropic API, server routes only — never expose the key)
1. **Document review** — send the uploaded file (PDF/image as a base64 `document`/`image` block) + the item's title/guidance. Prompt: does this satisfy the requirement; what's weak/missing; which pillar it strengthens. Write verdict to `documents.ai_verdict` (`satisfies|partial|insufficient`) and commentary to `ai_notes`.
2. **Readiness / gap analysis** — summarise evidence per pillar, flag the weakest pillar, warn before lodgement (mirrors the real rule: thin evidence in any one pillar weakens the whole application).
3. **Statement drafter** — timeline in, two first-person statements out (must corroborate without copying each other).
4. **Grounded Q&A** — answer from the checklist/rules; always defer to immi.homeaffairs.gov.au for anything authoritative.

Use a current model for review (Opus for document/vision review as in my Ridgeway build; Sonnet is fine for chat). Structured outputs: instruct JSON-only and parse defensively.

## Non-negotiables
- **RLS everywhere** — verified via the policies in `schema.sql`. Nothing readable across users.
- **Disclaimer banner** persistent in the footer and on the dashboard: organises & researches, **not migration advice**; verify against immi.homeaffairs.gov.au; consider a MARA-registered agent for non-standard cases (`visa.disclaimer` in the seed).
- Signed URLs for document access (private bucket) — no public links.
- `not_applicable` status must count as "done" for the readiness gate (e.g. no children, offshore police checks not needed).
- **Because others may use it:** `/terms` and `/privacy` pages, and the "not migration advice" disclaimer must be accepted at signup (store the timestamp). Handle personal/sensitive documents responsibly — private bucket, signed URLs, per-user isolation, and an account-delete path that removes their data.

## Nice-to-haves (phase 2)
- Export a lodgement pack (zip of docs by category) + a cover index PDF.
- Per-country police-check tracker with "ordered / received" and reminder dates.
- Switch to render the 309/100 offshore variant if `applicant is onshore` is unchecked.
- Timeline view of the relationship for the social/commitment pillars.
- **Monetisation:** Stripe subscription gating (free tier = checklist + limited uploads; paid = AI review + statement drafter + export pack). Same Stripe pattern as technologycoach. Don't build now — just don't design anything that blocks adding it later.

## Data files
- `schema.sql` — run first (tables, RLS, storage bucket + policy).
- `seed.sql` — run second; loads categories + items. Terminal-free, idempotent.
- `partner-visa-checklist-seed.json` — same content as `seed.sql` in JSON, for the app to read `guidance` text / `visa.*` metadata.
- `seed.ts` — optional Node alternative to `seed.sql` → `scripts/seed.ts`.
- `document-review-route.ts` — ready-made AI document-review route → `app/api/documents/[id]/review/route.ts`. Assumes a Supabase server client at `@/lib/supabase/server` and `@anthropic-ai/sdk`; wire those if absent.
