import {
  DONE_STATUSES,
  PILLARS,
  type ChecklistEntry,
  type Pillar,
} from '@/lib/types';

export interface PillarProgress {
  pillar: Pillar;
  total: number;
  done: number;
  verified: number;
  /** A pillar passes the gate once it has at least one verified item. */
  passes: boolean;
  percent: number;
}

export interface Readiness {
  pillars: PillarProgress[];
  /** Required items not yet in a done status. */
  outstandingRequired: ChecklistEntry[];
  requiredTotal: number;
  requiredDone: number;
  /** Pillars with no verified item yet. */
  failingPillars: Pillar[];
  weakestPillar: Pillar | null;
  isDecisionReady: boolean;
  percent: number;
}

/**
 * The readiness gate, per the brief:
 *
 *   Not decision-ready until every pillar has at least one VERIFIED item
 *   AND every required item is uploaded, verified or not_applicable.
 *
 * `not_applicable` counts as done deliberately — a couple with no children
 * should not be blocked by the children item.
 */
export function computeReadiness(entries: ChecklistEntry[]): Readiness {
  const pillars: PillarProgress[] = PILLARS.map((pillar) => {
    const inPillar = entries.filter(
      (e) => e.checklist_item.category.pillar === pillar,
    );
    const done = inPillar.filter((e) => DONE_STATUSES.includes(e.status)).length;
    const verified = inPillar.filter((e) => e.status === 'verified').length;
    return {
      pillar,
      total: inPillar.length,
      done,
      verified,
      passes: verified >= 1,
      percent: inPillar.length === 0 ? 0 : Math.round((done / inPillar.length) * 100),
    };
  });

  const required = entries.filter((e) => e.checklist_item.required);
  const outstandingRequired = required.filter(
    (e) => !DONE_STATUSES.includes(e.status),
  );
  const requiredDone = required.length - outstandingRequired.length;

  const failingPillars = pillars.filter((p) => !p.passes).map((p) => p.pillar);

  // Weakest = lowest completion; ties broken by fewest verified.
  const weakestPillar =
    pillars.length === 0
      ? null
      : [...pillars].sort(
          (a, b) => a.percent - b.percent || a.verified - b.verified,
        )[0].pillar;

  const isDecisionReady =
    entries.length > 0 &&
    failingPillars.length === 0 &&
    outstandingRequired.length === 0;

  const overallDone = entries.filter((e) => DONE_STATUSES.includes(e.status)).length;

  return {
    pillars,
    outstandingRequired,
    requiredTotal: required.length,
    requiredDone,
    failingPillars,
    weakestPillar,
    isDecisionReady,
    percent: entries.length === 0 ? 0 : Math.round((overallDone / entries.length) * 100),
  };
}
