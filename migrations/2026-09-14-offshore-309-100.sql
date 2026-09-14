-- Migrate an existing database from the onshore 820/801 to the offshore 309/100.
--
-- Run this ONLY if you already ran seed.sql before 2026-09-14. If your database
-- is fresh, the current seed.sql already contains everything here and this
-- script does nothing.
--
-- Why this is needed: seed.sql inserts an item only when its title is absent.
-- Re-running the updated seed.sql on an already-seeded database would leave the
-- old onshore items in place and add the new offshore ones alongside them,
-- producing a checklist that contradicts itself. This rewrites them in place,
-- which also preserves every application_items row and uploaded document
-- pointing at those items.
--
-- Idempotent: safe to run more than once.

begin;

-- ── 1. Applicant location: onshore substantive visa → offshore at lodge/grant ──
update checklist_items
set title = 'Applicant is outside Australia at lodgement and at grant',
    guidance = 'The 309 is an offshore visa: the applicant must be outside Australia when the application is lodged AND when it is granted. Record where the applicant is living and their status there.',
    applies_to = 'applicant',
    required = true
where title = 'Applicant is onshore & holds a valid substantive visa';

-- ── 2. 'No Further Stay' only blocks ONSHORE lodgement — replace it ───────────
-- Offshore the real constraint is the absence of a bridging visa.
update checklist_items
set title = 'No bridging visa — plan the time outside Australia',
    guidance = 'A 309 application does not grant any right to be in Australia while it is processed, and no bridging visa is issued. The applicant may visit on a separate visitor visa, but must be outside Australia when the visa is granted. Plan travel, work and housing around this.',
    applies_to = 'applicant',
    required = true
where title = 'Check current visa for ''No Further Stay'' condition';

-- ── 3. Registration cannot waive the 12 months offshore ──────────────────────
update checklist_items
set title = 'Compelling and compassionate circumstances (if relied on)',
    guidance = 'Only if you cannot show 12 months of living together immediately before applying. Registration under an Australian state or territory law generally does not waive the 12 months for an offshore application.',
    applies_to = 'couple',
    required = false
where title = 'Relationship registration certificate (if used to waive 12 months)';

-- ── 4. De facto basis wording ────────────────────────────────────────────────
update checklist_items
set guidance = '12 months living together immediately before applying, OR compelling and compassionate circumstances. Record which one you rely on. Note that an Australian state or territory relationship registration generally does not waive the 12 months for an offshore application.'
where title = 'Confirm de facto basis met';

-- ── 5. Health exam is with an overseas panel physician ───────────────────────
update checklist_items
set guidance = 'Do NOT book before lodging. Complete with a DHA-approved panel physician in the country where the applicant is living, once instructed through ImmiAccount.'
where title = 'Health examination (after lodgement)';

-- ── 6. Subclass on existing applications, and the default for new ones ───────
alter table applications alter column subclass set default '309/100';
update applications set subclass = '309/100' where subclass = '820/801';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect 0 rows. Anything returned is a leftover onshore item.
select id, title
from checklist_items
where title ilike '%onshore%'
   or title ilike '%No Further Stay%'
   or title ilike '%Relationship registration certificate%'
   or guidance ilike '%subclass 820%'
   or guidance ilike '%lodge the 820%';
