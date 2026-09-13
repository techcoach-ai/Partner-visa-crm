import 'server-only';
import type { ChecklistEntry } from '@/lib/types';
import { DONE_STATUSES, PILLAR_LABELS, STATUS_LABELS } from '@/lib/types';
import { computeReadiness } from '@/lib/readiness';
import { VISA } from '@/lib/visa-data';

/**
 * Renders the user's own checklist and the public visa rules into text the
 * model can answer from. Everything the assistant is allowed to assert comes
 * from here — the entries are already RLS-scoped to the caller.
 */
export function buildGroundingContext(entries: ChecklistEntry[]): string {
  const readiness = computeReadiness(entries);

  const rules = VISA.key_rules.map((r) => `- ${r}`).join('\n');

  const pillars = readiness.pillars
    .map(
      (p) =>
        `- ${PILLAR_LABELS[p.pillar]}: ${p.done}/${p.total} documented, ${p.verified} verified` +
        (p.passes ? '' : ' (NO verified item — blocks the readiness gate)'),
    )
    .join('\n');

  const byCategory = new Map<string, string[]>();
  for (const e of entries) {
    const cat = e.checklist_item?.category;
    if (!cat) continue;
    const docs = e.documents?.length ?? 0;
    const line =
      `  - ${e.checklist_item.title} [${STATUS_LABELS[e.status]}]` +
      `${e.checklist_item.required ? ' (required)' : ' (optional)'}` +
      `${docs > 0 ? ` — ${docs} document${docs === 1 ? '' : 's'} uploaded` : ''}` +
      `${e.notes ? ` — user note: ${e.notes}` : ''}`;
    const list = byCategory.get(cat.name);
    if (list) list.push(line);
    else byCategory.set(cat.name, [line]);
  }

  const checklist = Array.from(byCategory.entries())
    .map(([name, lines]) => `${name}:\n${lines.join('\n')}`)
    .join('\n\n');

  return `## Visa
${VISA.name} (subclass ${VISA.subclass}), basis: ${VISA.relationship_basis}.
Lodgement: ${VISA.lodgement}
Application charge: AUD ${VISA.application_fee_aud}. ${VISA.fee_note}
If the applicant is outside Australia, the relevant visa is instead ${VISA.offshore_alternative}.

## Key rules
${rules}

## This applicant's readiness
Decision-ready: ${readiness.isDecisionReady ? 'yes' : 'no'}
Required items complete: ${readiness.requiredDone}/${readiness.requiredTotal}
${pillars}

## This applicant's checklist
${checklist}`;
}

/** Compact per-pillar evidence summary for the gap analysis. */
export function buildPillarEvidence(entries: ChecklistEntry[]): string {
  return entries
    .filter((e) => e.checklist_item?.category?.pillar)
    .map((e) => {
      const verdicts = (e.documents ?? [])
        .map((d) => d.ai_verdict)
        .filter((v): v is NonNullable<typeof v> => Boolean(v) && v !== 'pending');
      return (
        `- [${e.checklist_item.category.pillar}] ${e.checklist_item.title}: ` +
        `${STATUS_LABELS[e.status]}, ${e.documents?.length ?? 0} document(s)` +
        (verdicts.length ? `, AI verdicts: ${verdicts.join(', ')}` : '') +
        (DONE_STATUSES.includes(e.status) ? '' : ' — OUTSTANDING')
      );
    })
    .join('\n');
}
