-- Partner Visa CRM — seed data (paste into Supabase SQL editor AFTER schema.sql)
-- Idempotent: safe to re-run. Categories upsert by key; items insert only if absent.

-- ── Categories ─────────────────────────────────────────────────────────
insert into checklist_categories (key, name, pillar, description, sort_order) values ('eligibility', 'Eligibility & relationship basis', NULL, 'Threshold checks that must pass before lodging.', 1)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('identity_app', 'Applicant identity', NULL, 'Who the applicant is.', 2)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('identity_spon', 'Sponsor identity & status', NULL, 'Who the sponsor is and proof they can sponsor.', 3)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('financial', 'Pillar 1 — Financial', 'financial', 'That you share finances and financial commitments.', 4)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('household', 'Pillar 2 — Household', 'household', 'That you share a home and domestic life.', 5)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('social', 'Pillar 3 — Social', 'social', 'That others recognise you as a couple.', 6)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('commitment', 'Pillar 4 — Commitment', 'commitment', 'That the relationship is genuine, continuing and long-term.', 7)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('statements', 'Statements & statutory declarations', NULL, 'Your own statements plus Form 888 witnesses.', 8)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('sponsorship', 'Sponsorship', NULL, 'The sponsor''s own application (Form 40SP).', 9)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('health', 'Health', NULL, 'Medical examination after lodgement.', 10)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('character', 'Character', NULL, 'Police clearances for applicant and sponsor.', 11)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;
insert into checklist_categories (key, name, pillar, description, sort_order) values ('lodgement', 'Lodgement & admin', NULL, 'Final steps to lodge decision-ready.', 12)
  on conflict (key) do update set name = excluded.name, pillar = excluded.pillar, description = excluded.description, sort_order = excluded.sort_order;

-- ── Items (insert only if not already present for that category) ────────
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Confirm de facto basis met', NULL, 'couple', true, NULL, '12 months cohabitation immediately before applying, OR registered relationship, OR child of the relationship. Record which one you rely on.', 0
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Confirm de facto basis met');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Relationship registration certificate (if used to waive 12 months)', NULL, 'couple', false, NULL, 'Certificate from a state/territory relationships register (NSW, VIC, QLD, ACT, TAS, SA). Not available in WA or NT.', 1
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Relationship registration certificate (if used to waive 12 months)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant is onshore & holds a valid substantive visa', NULL, 'applicant', true, NULL, 'Must be in Australia to lodge the 820. Note current visa and expiry.', 2
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant is onshore & holds a valid substantive visa');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Check current visa for ''No Further Stay'' condition', NULL, 'applicant', true, NULL, 'Conditions 8503/8534/8535 can block an onshore lodgement unless waived. Verify in VEVO.', 3
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Check current visa for ''No Further Stay'' condition');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor eligibility & sponsorship limits', NULL, 'sponsor', true, NULL, 'Sponsor must be an Australian citizen, PR, or eligible NZ citizen; must not have sponsored 2+ partners previously; and must not have been sponsored as a partner within the last 5 years.', 4
  from checklist_categories c where c.key = 'eligibility'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor eligibility & sponsorship limits');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant passport (photo/bio page)', NULL, 'applicant', true, NULL, 'Valid passport. Include all pages showing identity and any name changes.', 5
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant passport (photo/bio page)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant birth certificate', NULL, 'applicant', true, NULL, 'Certified translation if not in English.', 6
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant birth certificate');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant passport-style photo', NULL, 'applicant', true, NULL, 'Recent, meets DHA photo specs.', 7
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant passport-style photo');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Change-of-name / prior identity documents', NULL, 'applicant', false, NULL, 'Only if the applicant has changed name or held other identity documents.', 8
  from checklist_categories c where c.key = 'identity_app'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Change-of-name / prior identity documents');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Proof sponsor is Australian citizen / PR / eligible NZ citizen', NULL, 'sponsor', true, NULL, 'Australian passport, citizenship certificate, or visa grant showing PR/eligible NZ status.', 9
  from checklist_categories c where c.key = 'identity_spon'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Proof sponsor is Australian citizen / PR / eligible NZ citizen');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor birth certificate / photo ID', NULL, 'sponsor', true, NULL, 'Supports identity on Form 40SP.', 10
  from checklist_categories c where c.key = 'identity_spon'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor birth certificate / photo ID');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint bank account statements', NULL, 'couple', true, NULL, 'Statements over time carry the most weight. Show ongoing joint use, not a token account.', 11
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint bank account statements');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint liabilities (loans, credit, insurance)', NULL, 'couple', false, NULL, 'Joint loans, shared insurance policies, one partner named on the other''s policy.', 12
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint liabilities (loans, credit, insurance)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Shared household bills / utilities in both names', NULL, 'couple', true, NULL, 'Electricity, gas, water, internet, phone showing both names or the same address.', 13
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Shared household bills / utilities in both names');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint ownership of major assets', NULL, 'couple', false, NULL, 'Property, vehicle, or other significant shared assets.', 14
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint ownership of major assets');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Evidence of how you share finances / support each other', NULL, 'couple', false, NULL, 'Transfers between accounts, one supporting the other, shared budgeting.', 15
  from checklist_categories c where c.key = 'financial'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Evidence of how you share finances / support each other');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint lease or mortgage / property documents', NULL, 'couple', true, NULL, 'Both names on the tenancy or title. If only one name, explain in statements and support with other household evidence.', 16
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint lease or mortgage / property documents');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Mail addressed to both at the same address', NULL, 'couple', true, NULL, 'A spread of correspondence over time to the shared address.', 17
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Mail addressed to both at the same address');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Utility / service accounts at shared address', NULL, 'couple', false, NULL, 'Accounts, connection notices, or council correspondence tied to the home.', 18
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Utility / service accounts at shared address');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Statement on division of household responsibilities', NULL, 'couple', false, NULL, 'Who does what — chores, finances, care duties. Usually covered in personal statements.', 19
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Statement on division of household responsibilities');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Shared responsibility for children / dependants (if any)', NULL, 'couple', false, NULL, 'Only if applicable.', 20
  from checklist_categories c where c.key = 'household'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Shared responsibility for children / dependants (if any)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Photos together across the relationship timeline', NULL, 'couple', true, NULL, 'Dated where possible: with family/friends, events, travel, over time — not just one occasion.', 21
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Photos together across the relationship timeline');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint travel evidence', NULL, 'couple', false, NULL, 'Bookings, itineraries, boarding passes showing travel as a couple.', 22
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint travel evidence');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Joint invitations / events / memberships', NULL, 'couple', false, NULL, 'Invitations addressed to both, shared club/gym memberships, joint bookings.', 23
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Joint invitations / events / memberships');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Evidence you present publicly as a couple', NULL, 'couple', false, NULL, 'Social media, messages to/from friends and family acknowledging the relationship.', 24
  from checklist_categories c where c.key = 'social'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Evidence you present publicly as a couple');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Communication history during any separations', NULL, 'couple', false, NULL, 'Messages/calls when apart, showing a continuing relationship.', 25
  from checklist_categories c where c.key = 'commitment'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Communication history during any separations');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Evidence of future plans together', NULL, 'couple', false, NULL, 'Wills naming each other, superannuation/insurance beneficiaries, joint long-term commitments.', 26
  from checklist_categories c where c.key = 'commitment'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Evidence of future plans together');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Relationship history timeline', NULL, 'couple', true, NULL, 'How and when you met, key milestones, when cohabitation began, decision to commit. Feeds both personal statements.', 27
  from checklist_categories c where c.key = 'commitment'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Relationship history timeline');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant''s personal statement', NULL, 'applicant', true, NULL, 'First-person account of the relationship across all four pillars. The AI drafter can build a first pass from your timeline.', 28
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant''s personal statement');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor''s personal statement', NULL, 'sponsor', true, NULL, 'The sponsor''s own first-person account — should corroborate, not copy, the applicant''s.', 29
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor''s personal statement');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Form 888 statutory declaration #1', NULL, 'couple', true, 'Form 888', 'From an Australian citizen or PR (16+) who knows you as a couple. Witnessed correctly.', 30
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Form 888 statutory declaration #1');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Form 888 statutory declaration #2', NULL, 'couple', true, 'Form 888', 'A second independent witness. More strong 888s = stronger social/commitment evidence.', 31
  from checklist_categories c where c.key = 'statements'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Form 888 statutory declaration #2');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor application (Form 40SP)', NULL, 'sponsor', true, 'Form 40SP', 'Lodged by the sponsor through their own ImmiAccount at the same time as the main application.', 32
  from checklist_categories c where c.key = 'sponsorship'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor application (Form 40SP)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor AFP National Police Check (Code 33)', NULL, 'sponsor', true, NULL, 'Australian Federal Police check submitted as part of Form 40SP.', 33
  from checklist_categories c where c.key = 'sponsorship'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor AFP National Police Check (Code 33)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Health examination (after lodgement)', NULL, 'applicant', true, NULL, 'Do NOT book before lodging. Complete via a DHA-approved panel physician (Bupa Medical Visa Services in Australia) once instructed through ImmiAccount.', 34
  from checklist_categories c where c.key = 'health'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Health examination (after lodgement)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Applicant police clearances (all relevant countries)', NULL, 'applicant', true, NULL, 'One for every country lived in 12+ months since age 16. Note each country and order early — some take weeks.', 35
  from checklist_categories c where c.key = 'character'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Applicant police clearances (all relevant countries)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Sponsor police clearances', NULL, 'sponsor', true, NULL, 'Sponsor also provides clearances for countries lived in 12+ months since 16 (AFP check via Form 40SP covers Australia).', 36
  from checklist_categories c where c.key = 'character'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Sponsor police clearances');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Form 80 (if requested / complex history)', NULL, 'applicant', false, 'Form 80', 'Detailed personal particulars form — include if the applicant has extensive travel/residence history.', 37
  from checklist_categories c where c.key = 'character'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Form 80 (if requested / complex history)');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'ImmiAccount created & application completed', NULL, 'couple', true, NULL, 'Paper applications are not accepted.', 38
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'ImmiAccount created & application completed');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Four-pillar readiness check passed', NULL, 'couple', true, NULL, 'Every pillar has solid evidence before lodging. The dashboard gate enforces this.', 39
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Four-pillar readiness check passed');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Fee ready (AUD 11,710) & payment method', NULL, 'couple', true, NULL, 'Non-refundable. Card surcharge applies. Confirm current fee before paying.', 40
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Fee ready (AUD 11,710) & payment method');
insert into checklist_items (category_id, title, description, applies_to, required, form_reference, guidance, sort_order)
  select c.id, 'Decision-ready confirmation', NULL, 'couple', true, NULL, 'Under the April 2026 approach, lodge only when complete — follow-up requests are limited and incomplete applications risk faster refusal.', 41
  from checklist_categories c where c.key = 'lodgement'
  and not exists (select 1 from checklist_items i where i.category_id = c.id and i.title = 'Decision-ready confirmation');
