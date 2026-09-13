/**
 * Assertions for the readiness gate — the one rule the whole app turns on.
 *
 * Run with: npm run verify:readiness
 */
import { computeReadiness } from '@/lib/readiness';
import type { ChecklistEntry, ItemStatus, Pillar } from '@/lib/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

let n = 0;
function entry(pillar: Pillar | null, status: ItemStatus, required: boolean): ChecklistEntry {
  n++;
  return {
    id: `e${n}`, application_id: 'a', item_id: `i${n}`, status, notes: null,
    updated_at: '', documents: [],
    checklist_item: {
      id: `i${n}`, category_id: 'c', title: `t${n}`, description: null,
      applies_to: 'couple', required, form_reference: null, guidance: null, sort_order: n,
      category: { id: 'c', key: pillar ?? 'admin', name: 'C', pillar, description: null, sort_order: 1 },
    },
  };
}

const allFour: Pillar[] = ['financial', 'household', 'social', 'commitment'];

// 1. All pillars verified + all required done => ready
const ready = [...allFour.map(p => entry(p, 'verified', true)), entry(null, 'uploaded', true)];
check('all pillars verified + required done => decision-ready', computeReadiness(ready).isDecisionReady);

// 2. One pillar only 'uploaded' (not verified) => NOT ready
const oneUnverified = [
  entry('financial', 'uploaded', true),
  ...allFour.slice(1).map(p => entry(p, 'verified', true)),
];
const r2 = computeReadiness(oneUnverified);
check('pillar with uploaded-but-not-verified blocks the gate', !r2.isDecisionReady);
check('  and is named in failingPillars', r2.failingPillars.includes('financial'));

// 3. not_applicable counts as done for a required item
const naRequired = [
  ...allFour.map(p => entry(p, 'verified', true)),
  entry(null, 'not_applicable', true),
];
check('not_applicable satisfies a required item', computeReadiness(naRequired).isDecisionReady);

// 4. An outstanding required admin item blocks
const outstanding = [
  ...allFour.map(p => entry(p, 'verified', true)),
  entry(null, 'not_started', true),
];
const r4 = computeReadiness(outstanding);
check('outstanding required item blocks the gate', !r4.isDecisionReady);
check('  and appears in outstandingRequired', r4.outstandingRequired.length === 1);

// 5. Optional items never block
const optionalOnly = [
  ...allFour.map(p => entry(p, 'verified', true)),
  entry(null, 'not_started', false),
];
check('optional items never block the gate', computeReadiness(optionalOnly).isDecisionReady);

// 6. Empty checklist is not ready (guards a seeding failure)
check('empty checklist is not decision-ready', !computeReadiness([]).isDecisionReady);

// 7. in_progress does NOT count as done
const inProg = [
  ...allFour.map(p => entry(p, 'verified', true)),
  entry(null, 'in_progress', true),
];
check('in_progress does not count as done', !computeReadiness(inProg).isDecisionReady);

// 8. weakest pillar = lowest completion
const weak = [
  entry('financial', 'verified', true), entry('financial', 'verified', true),
  entry('household', 'verified', true), entry('household', 'not_started', true),
  entry('social', 'verified', true),
  entry('commitment', 'verified', true),
];
check('weakest pillar is the least complete', computeReadiness(weak).weakestPillar === 'household');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
