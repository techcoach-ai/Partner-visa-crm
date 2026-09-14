-- Migrate an existing database to the current offshore 309/100 checklist.
--
-- Run it AFTER seed.sql, always in that order: seed.sql creates the categories
-- these statements attach to. Run it if you ran any version of seed.sql before
-- now; it is idempotent and a harmless no-op on a database that is already
-- current, so when in doubt, run it.
--
-- Verified against PostgreSQL 16 from both prior seeds: each converges to a
-- state byte-identical to a fresh schema.sql + seed.sql, and stays there when
-- re-run.
--
-- Why it is needed: seed.sql inserts an item only when its title is absent, so
-- re-running the current seed.sql over an older database leaves the stale items
-- in place and adds the new ones alongside, producing a checklist that
-- contradicts itself. This reconciles the rows instead.
--
-- It handles every state this database may be in:
--   A. never seeded                          -> every statement no-ops
--   B. seeded with the onshore 820/801 seed  -> renamed and rewritten
--   C. seeded with the first offshore seed   -> renamed and rewritten
--
-- Renames are used rather than delete-and-insert so that the application_items
-- rows, their statuses and any uploaded documents pointing at these template
-- items all survive.

begin;

-- ── 1. Location at lodgement ─────────────────────────────────────────────────
-- From B: the onshore substantive-visa check. From C: the combined item.
update checklist_items
set title = 'Applicant is outside Australia at time of application',
    guidance = 'The 309 must be lodged while the applicant is offshore. Note current country of residence.',
    applies_to = 'applicant',
    required = true
where title in (
  'Applicant is onshore & holds a valid substantive visa',
  'Applicant is outside Australia at lodgement and at grant'
);

-- ── 2. Location at grant ─────────────────────────────────────────────────────
-- 'No Further Stay' (8503/8534/8535) only blocks an ONSHORE lodgement and is
-- meaningless for a 309. That slot now carries the offshore-at-grant rule.
update checklist_items
set title = 'Applicant will be outside Australia when the visa is granted',
    guidance = 'For the 309, the applicant must be offshore at the moment of grant. If visiting Australia during processing, plan to depart before a decision is expected.',
    applies_to = 'applicant',
    required = true
where title in (
  'Check current visa for ''No Further Stay'' condition',
  'No bridging visa — plan the time outside Australia'
);

-- ── 3. Retire the registration / compelling-circumstances item ───────────────
-- It is no longer a checklist item; the point is covered by the guidance on
-- 'Confirm de facto basis met'.
--
-- Deleting a checklist_items row cascades to application_items and then to
-- documents, so this deletes ONLY when nothing is attached. If a document was
-- uploaded against it the row is left alone and reported by the final query,
-- so you can move the file before removing it by hand.
delete from checklist_items ci
where ci.title in (
  'Relationship registration certificate (if used to waive 12 months)',
  'Compelling and compassionate circumstances (if relied on)'
)
and not exists (
  select 1
  from application_items ai
  join documents d on d.application_item_id = ai.id
  where ai.item_id = ci.id
);

-- ── 4. Re-sync every title's guidance, flags and ordering to the seed ────────
-- Titles that are already correct still need their guidance and sort_order
-- refreshed, since the item count changed and every index after the
-- eligibility block shifted.
update checklist_items ci set
  guidance = '12 months cohabitation immediately before applying, OR a child of the relationship, OR compelling/compassionate circumstances. Registration usually can''t waive the 12 months for offshore couples. Record which one you rely on.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 0
from checklist_categories c
where ci.category_id = c.id and c.key = 'eligibility' and ci.title = 'Confirm de facto basis met';
update checklist_items ci set
  guidance = 'The 309 must be lodged while the applicant is offshore. Note current country of residence.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 1
from checklist_categories c
where ci.category_id = c.id and c.key = 'eligibility' and ci.title = 'Applicant is outside Australia at time of application';
update checklist_items ci set
  guidance = 'For the 309, the applicant must be offshore at the moment of grant. If visiting Australia during processing, plan to depart before a decision is expected.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 2
from checklist_categories c
where ci.category_id = c.id and c.key = 'eligibility' and ci.title = 'Applicant will be outside Australia when the visa is granted';
update checklist_items ci set
  guidance = 'Sponsor must be an Australian citizen, PR, or eligible NZ citizen; must not have sponsored 2+ partners previously; and must not have been sponsored as a partner within the last 5 years.',
  applies_to = 'sponsor',
  required = true,
  form_reference = NULL,
  sort_order = 3
from checklist_categories c
where ci.category_id = c.id and c.key = 'eligibility' and ci.title = 'Sponsor eligibility & sponsorship limits';
update checklist_items ci set
  guidance = 'Valid passport. Include all pages showing identity and any name changes.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 4
from checklist_categories c
where ci.category_id = c.id and c.key = 'identity_app' and ci.title = 'Applicant passport (photo/bio page)';
update checklist_items ci set
  guidance = 'Certified translation if not in English.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 5
from checklist_categories c
where ci.category_id = c.id and c.key = 'identity_app' and ci.title = 'Applicant birth certificate';
update checklist_items ci set
  guidance = 'Recent, meets DHA photo specs.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 6
from checklist_categories c
where ci.category_id = c.id and c.key = 'identity_app' and ci.title = 'Applicant passport-style photo';
update checklist_items ci set
  guidance = 'Only if the applicant has changed name or held other identity documents.',
  applies_to = 'applicant',
  required = false,
  form_reference = NULL,
  sort_order = 7
from checklist_categories c
where ci.category_id = c.id and c.key = 'identity_app' and ci.title = 'Change-of-name / prior identity documents';
update checklist_items ci set
  guidance = 'Australian passport, citizenship certificate, or visa grant showing PR/eligible NZ status.',
  applies_to = 'sponsor',
  required = true,
  form_reference = NULL,
  sort_order = 8
from checklist_categories c
where ci.category_id = c.id and c.key = 'identity_spon' and ci.title = 'Proof sponsor is Australian citizen / PR / eligible NZ citizen';
update checklist_items ci set
  guidance = 'Supports identity on Form 40SP.',
  applies_to = 'sponsor',
  required = true,
  form_reference = NULL,
  sort_order = 9
from checklist_categories c
where ci.category_id = c.id and c.key = 'identity_spon' and ci.title = 'Sponsor birth certificate / photo ID';
update checklist_items ci set
  guidance = 'Statements over time carry the most weight. Show ongoing joint use, not a token account.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 10
from checklist_categories c
where ci.category_id = c.id and c.key = 'financial' and ci.title = 'Joint bank account statements';
update checklist_items ci set
  guidance = 'Joint loans, shared insurance policies, one partner named on the other''s policy.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 11
from checklist_categories c
where ci.category_id = c.id and c.key = 'financial' and ci.title = 'Joint liabilities (loans, credit, insurance)';
update checklist_items ci set
  guidance = 'Electricity, gas, water, internet, phone showing both names or the same address.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 12
from checklist_categories c
where ci.category_id = c.id and c.key = 'financial' and ci.title = 'Shared household bills / utilities in both names';
update checklist_items ci set
  guidance = 'Property, vehicle, or other significant shared assets.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 13
from checklist_categories c
where ci.category_id = c.id and c.key = 'financial' and ci.title = 'Joint ownership of major assets';
update checklist_items ci set
  guidance = 'Transfers between accounts, one supporting the other, shared budgeting.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 14
from checklist_categories c
where ci.category_id = c.id and c.key = 'financial' and ci.title = 'Evidence of how you share finances / support each other';
update checklist_items ci set
  guidance = 'Both names on the tenancy or title. If only one name, explain in statements and support with other household evidence.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 15
from checklist_categories c
where ci.category_id = c.id and c.key = 'household' and ci.title = 'Joint lease or mortgage / property documents';
update checklist_items ci set
  guidance = 'A spread of correspondence over time to the shared address.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 16
from checklist_categories c
where ci.category_id = c.id and c.key = 'household' and ci.title = 'Mail addressed to both at the same address';
update checklist_items ci set
  guidance = 'Accounts, connection notices, or council correspondence tied to the home.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 17
from checklist_categories c
where ci.category_id = c.id and c.key = 'household' and ci.title = 'Utility / service accounts at shared address';
update checklist_items ci set
  guidance = 'Who does what — chores, finances, care duties. Usually covered in personal statements.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 18
from checklist_categories c
where ci.category_id = c.id and c.key = 'household' and ci.title = 'Statement on division of household responsibilities';
update checklist_items ci set
  guidance = 'Only if applicable.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 19
from checklist_categories c
where ci.category_id = c.id and c.key = 'household' and ci.title = 'Shared responsibility for children / dependants (if any)';
update checklist_items ci set
  guidance = 'Dated where possible: with family/friends, events, travel, over time — not just one occasion.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 20
from checklist_categories c
where ci.category_id = c.id and c.key = 'social' and ci.title = 'Photos together across the relationship timeline';
update checklist_items ci set
  guidance = 'Bookings, itineraries, boarding passes showing travel as a couple.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 21
from checklist_categories c
where ci.category_id = c.id and c.key = 'social' and ci.title = 'Joint travel evidence';
update checklist_items ci set
  guidance = 'Invitations addressed to both, shared club/gym memberships, joint bookings.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 22
from checklist_categories c
where ci.category_id = c.id and c.key = 'social' and ci.title = 'Joint invitations / events / memberships';
update checklist_items ci set
  guidance = 'Social media, messages to/from friends and family acknowledging the relationship.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 23
from checklist_categories c
where ci.category_id = c.id and c.key = 'social' and ci.title = 'Evidence you present publicly as a couple';
update checklist_items ci set
  guidance = 'Messages/calls when apart, showing a continuing relationship.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 24
from checklist_categories c
where ci.category_id = c.id and c.key = 'commitment' and ci.title = 'Communication history during any separations';
update checklist_items ci set
  guidance = 'Wills naming each other, superannuation/insurance beneficiaries, joint long-term commitments.',
  applies_to = 'couple',
  required = false,
  form_reference = NULL,
  sort_order = 25
from checklist_categories c
where ci.category_id = c.id and c.key = 'commitment' and ci.title = 'Evidence of future plans together';
update checklist_items ci set
  guidance = 'How and when you met, key milestones, when cohabitation began, decision to commit. Feeds both personal statements.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 26
from checklist_categories c
where ci.category_id = c.id and c.key = 'commitment' and ci.title = 'Relationship history timeline';
update checklist_items ci set
  guidance = 'First-person account of the relationship across all four pillars. The AI drafter can build a first pass from your timeline.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 27
from checklist_categories c
where ci.category_id = c.id and c.key = 'statements' and ci.title = 'Applicant''s personal statement';
update checklist_items ci set
  guidance = 'The sponsor''s own first-person account — should corroborate, not copy, the applicant''s.',
  applies_to = 'sponsor',
  required = true,
  form_reference = NULL,
  sort_order = 28
from checklist_categories c
where ci.category_id = c.id and c.key = 'statements' and ci.title = 'Sponsor''s personal statement';
update checklist_items ci set
  guidance = 'From an Australian citizen or PR (16+) who knows you as a couple. Witnessed correctly.',
  applies_to = 'couple',
  required = true,
  form_reference = 'Form 888',
  sort_order = 29
from checklist_categories c
where ci.category_id = c.id and c.key = 'statements' and ci.title = 'Form 888 statutory declaration #1';
update checklist_items ci set
  guidance = 'A second independent witness. More strong 888s = stronger social/commitment evidence.',
  applies_to = 'couple',
  required = true,
  form_reference = 'Form 888',
  sort_order = 30
from checklist_categories c
where ci.category_id = c.id and c.key = 'statements' and ci.title = 'Form 888 statutory declaration #2';
update checklist_items ci set
  guidance = 'Lodged by the sponsor through their own ImmiAccount at the same time as the main application.',
  applies_to = 'sponsor',
  required = true,
  form_reference = 'Form 40SP',
  sort_order = 31
from checklist_categories c
where ci.category_id = c.id and c.key = 'sponsorship' and ci.title = 'Sponsor application (Form 40SP)';
update checklist_items ci set
  guidance = 'Australian Federal Police check submitted as part of Form 40SP.',
  applies_to = 'sponsor',
  required = true,
  form_reference = NULL,
  sort_order = 32
from checklist_categories c
where ci.category_id = c.id and c.key = 'sponsorship' and ci.title = 'Sponsor AFP National Police Check (Code 33)';
update checklist_items ci set
  guidance = 'Do NOT book before lodging. Complete with a DHA-approved panel physician — normally in the country where the applicant is living. If the applicant happens to be visiting Australia when instructed, Bupa Medical Visa Services handles these in Australia. Book only once instructed through ImmiAccount.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 33
from checklist_categories c
where ci.category_id = c.id and c.key = 'health' and ci.title = 'Health examination (after lodgement)';
update checklist_items ci set
  guidance = 'One for every country lived in 12+ months since age 16. Note each country and order early — some take weeks.',
  applies_to = 'applicant',
  required = true,
  form_reference = NULL,
  sort_order = 34
from checklist_categories c
where ci.category_id = c.id and c.key = 'character' and ci.title = 'Applicant police clearances (all relevant countries)';
update checklist_items ci set
  guidance = 'Sponsor also provides clearances for countries lived in 12+ months since 16 (AFP check via Form 40SP covers Australia).',
  applies_to = 'sponsor',
  required = true,
  form_reference = NULL,
  sort_order = 35
from checklist_categories c
where ci.category_id = c.id and c.key = 'character' and ci.title = 'Sponsor police clearances';
update checklist_items ci set
  guidance = 'Detailed personal particulars form — include if the applicant has extensive travel/residence history.',
  applies_to = 'applicant',
  required = false,
  form_reference = 'Form 80',
  sort_order = 36
from checklist_categories c
where ci.category_id = c.id and c.key = 'character' and ci.title = 'Form 80 (if requested / complex history)';
update checklist_items ci set
  guidance = 'Paper applications are not accepted.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 37
from checklist_categories c
where ci.category_id = c.id and c.key = 'lodgement' and ci.title = 'ImmiAccount created & application completed';
update checklist_items ci set
  guidance = 'Every pillar has solid evidence before lodging. The dashboard gate enforces this.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 38
from checklist_categories c
where ci.category_id = c.id and c.key = 'lodgement' and ci.title = 'Four-pillar readiness check passed';
update checklist_items ci set
  guidance = 'Non-refundable. Card surcharge applies. Confirm current fee before paying.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 39
from checklist_categories c
where ci.category_id = c.id and c.key = 'lodgement' and ci.title = 'Fee ready (AUD 11,710) & payment method';
update checklist_items ci set
  guidance = 'Under the April 2026 approach, lodge only when complete — follow-up requests are limited and incomplete applications risk faster refusal.',
  applies_to = 'couple',
  required = true,
  form_reference = NULL,
  sort_order = 40
from checklist_categories c
where ci.category_id = c.id and c.key = 'lodgement' and ci.title = 'Decision-ready confirmation';

-- ── 5. Insert anything still missing ─────────────────────────────────────────
-- Covers a database seeded before these items existed at all.
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Confirm de facto basis met', NULL, 'couple', true, NULL, '12 months cohabitation immediately before applying, OR a child of the relationship, OR compelling/compassionate circumstances. Registration usually can''t waive the 12 months for offshore couples. Record which one you rely on.', 0
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Confirm de facto basis met');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant is outside Australia at time of application', NULL, 'applicant', true, NULL, 'The 309 must be lodged while the applicant is offshore. Note current country of residence.', 1
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant is outside Australia at time of application');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant will be outside Australia when the visa is granted', NULL, 'applicant', true, NULL, 'For the 309, the applicant must be offshore at the moment of grant. If visiting Australia during processing, plan to depart before a decision is expected.', 2
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant will be outside Australia when the visa is granted');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor eligibility & sponsorship limits', NULL, 'sponsor', true, NULL, 'Sponsor must be an Australian citizen, PR, or eligible NZ citizen; must not have sponsored 2+ partners previously; and must not have been sponsored as a partner within the last 5 years.', 3
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor eligibility & sponsorship limits');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant passport (photo/bio page)', NULL, 'applicant', true, NULL, 'Valid passport. Include all pages showing identity and any name changes.', 4
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant passport (photo/bio page)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant birth certificate', NULL, 'applicant', true, NULL, 'Certified translation if not in English.', 5
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant birth certificate');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant passport-style photo', NULL, 'applicant', true, NULL, 'Recent, meets DHA photo specs.', 6
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant passport-style photo');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Change-of-name / prior identity documents', NULL, 'applicant', false, NULL, 'Only if the applicant has changed name or held other identity documents.', 7
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Change-of-name / prior identity documents');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Proof sponsor is Australian citizen / PR / eligible NZ citizen', NULL, 'sponsor', true, NULL, 'Australian passport, citizenship certificate, or visa grant showing PR/eligible NZ status.', 8
  from checklist_categories c where c.key = 'identity_spon'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Proof sponsor is Australian citizen / PR / eligible NZ citizen');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor birth certificate / photo ID', NULL, 'sponsor', true, NULL, 'Supports identity on Form 40SP.', 9
  from checklist_categories c where c.key = 'identity_spon'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor birth certificate / photo ID');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint bank account statements', NULL, 'couple', true, NULL, 'Statements over time carry the most weight. Show ongoing joint use, not a token account.', 10
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint bank account statements');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint liabilities (loans, credit, insurance)', NULL, 'couple', false, NULL, 'Joint loans, shared insurance policies, one partner named on the other''s policy.', 11
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint liabilities (loans, credit, insurance)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Shared household bills / utilities in both names', NULL, 'couple', true, NULL, 'Electricity, gas, water, internet, phone showing both names or the same address.', 12
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Shared household bills / utilities in both names');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint ownership of major assets', NULL, 'couple', false, NULL, 'Property, vehicle, or other significant shared assets.', 13
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint ownership of major assets');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Evidence of how you share finances / support each other', NULL, 'couple', false, NULL, 'Transfers between accounts, one supporting the other, shared budgeting.', 14
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Evidence of how you share finances / support each other');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint lease or mortgage / property documents', NULL, 'couple', true, NULL, 'Both names on the tenancy or title. If only one name, explain in statements and support with other household evidence.', 15
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint lease or mortgage / property documents');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Mail addressed to both at the same address', NULL, 'couple', true, NULL, 'A spread of correspondence over time to the shared address.', 16
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Mail addressed to both at the same address');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Utility / service accounts at shared address', NULL, 'couple', false, NULL, 'Accounts, connection notices, or council correspondence tied to the home.', 17
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Utility / service accounts at shared address');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Statement on division of household responsibilities', NULL, 'couple', false, NULL, 'Who does what — chores, finances, care duties. Usually covered in personal statements.', 18
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Statement on division of household responsibilities');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Shared responsibility for children / dependants (if any)', NULL, 'couple', false, NULL, 'Only if applicable.', 19
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Shared responsibility for children / dependants (if any)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Photos together across the relationship timeline', NULL, 'couple', true, NULL, 'Dated where possible: with family/friends, events, travel, over time — not just one occasion.', 20
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Photos together across the relationship timeline');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint travel evidence', NULL, 'couple', false, NULL, 'Bookings, itineraries, boarding passes showing travel as a couple.', 21
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint travel evidence');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint invitations / events / memberships', NULL, 'couple', false, NULL, 'Invitations addressed to both, shared club/gym memberships, joint bookings.', 22
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint invitations / events / memberships');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Evidence you present publicly as a couple', NULL, 'couple', false, NULL, 'Social media, messages to/from friends and family acknowledging the relationship.', 23
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Evidence you present publicly as a couple');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Communication history during any separations', NULL, 'couple', false, NULL, 'Messages/calls when apart, showing a continuing relationship.', 24
  from checklist_categories c where c.key = 'commitment'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Communication history during any separations');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Evidence of future plans together', NULL, 'couple', false, NULL, 'Wills naming each other, superannuation/insurance beneficiaries, joint long-term commitments.', 25
  from checklist_categories c where c.key = 'commitment'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Evidence of future plans together');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Relationship history timeline', NULL, 'couple', true, NULL, 'How and when you met, key milestones, when cohabitation began, decision to commit. Feeds both personal statements.', 26
  from checklist_categories c where c.key = 'commitment'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Relationship history timeline');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant''s personal statement', NULL, 'applicant', true, NULL, 'First-person account of the relationship across all four pillars. The AI drafter can build a first pass from your timeline.', 27
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant''s personal statement');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor''s personal statement', NULL, 'sponsor', true, NULL, 'The sponsor''s own first-person account — should corroborate, not copy, the applicant''s.', 28
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor''s personal statement');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Form 888 statutory declaration #1', NULL, 'couple', true, 'Form 888', 'From an Australian citizen or PR (16+) who knows you as a couple. Witnessed correctly.', 29
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Form 888 statutory declaration #1');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Form 888 statutory declaration #2', NULL, 'couple', true, 'Form 888', 'A second independent witness. More strong 888s = stronger social/commitment evidence.', 30
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Form 888 statutory declaration #2');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor application (Form 40SP)', NULL, 'sponsor', true, 'Form 40SP', 'Lodged by the sponsor through their own ImmiAccount at the same time as the main application.', 31
  from checklist_categories c where c.key = 'sponsorship'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor application (Form 40SP)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor AFP National Police Check (Code 33)', NULL, 'sponsor', true, NULL, 'Australian Federal Police check submitted as part of Form 40SP.', 32
  from checklist_categories c where c.key = 'sponsorship'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor AFP National Police Check (Code 33)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Health examination (after lodgement)', NULL, 'applicant', true, NULL, 'Do NOT book before lodging. Complete with a DHA-approved panel physician — normally in the country where the applicant is living. If the applicant happens to be visiting Australia when instructed, Bupa Medical Visa Services handles these in Australia. Book only once instructed through ImmiAccount.', 33
  from checklist_categories c where c.key = 'health'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Health examination (after lodgement)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant police clearances (all relevant countries)', NULL, 'applicant', true, NULL, 'One for every country lived in 12+ months since age 16. Note each country and order early — some take weeks.', 34
  from checklist_categories c where c.key = 'character'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant police clearances (all relevant countries)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor police clearances', NULL, 'sponsor', true, NULL, 'Sponsor also provides clearances for countries lived in 12+ months since 16 (AFP check via Form 40SP covers Australia).', 35
  from checklist_categories c where c.key = 'character'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor police clearances');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Form 80 (if requested / complex history)', NULL, 'applicant', false, 'Form 80', 'Detailed personal particulars form — include if the applicant has extensive travel/residence history.', 36
  from checklist_categories c where c.key = 'character'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Form 80 (if requested / complex history)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'ImmiAccount created & application completed', NULL, 'couple', true, NULL, 'Paper applications are not accepted.', 37
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'ImmiAccount created & application completed');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Four-pillar readiness check passed', NULL, 'couple', true, NULL, 'Every pillar has solid evidence before lodging. The dashboard gate enforces this.', 38
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Four-pillar readiness check passed');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Fee ready (AUD 11,710) & payment method', NULL, 'couple', true, NULL, 'Non-refundable. Card surcharge applies. Confirm current fee before paying.', 39
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Fee ready (AUD 11,710) & payment method');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Decision-ready confirmation', NULL, 'couple', true, NULL, 'Under the April 2026 approach, lodge only when complete — follow-up requests are limited and incomplete applications risk faster refusal.', 40
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Decision-ready confirmation');

-- ── 6. Subclass on existing applications, and the default for new ones ───────
alter table applications alter column subclass set default '309/100';
update applications set subclass = '309/100' where subclass <> '309/100';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect exactly 41 rows, and nothing in the second query.
select count(*) as checklist_items_total from checklist_items;

select ci.id, ci.title, 'stale item — move any attached files, then delete by hand' as note
from checklist_items ci
where ci.title ilike '%onshore%'
   or ci.title ilike '%No Further Stay%'
   or ci.title ilike '%Relationship registration certificate%'
   or ci.title ilike '%Compelling and compassionate%'
   or ci.title = 'Applicant is outside Australia at lodgement and at grant'
   or ci.title = 'No bridging visa — plan the time outside Australia'
   or ci.guidance ilike '%820%';
