/**
 * Readiness / gap analysis — POST /api/readiness
 *
 * Summarises evidence per pillar, names the weakest, and warns before
 * lodgement. Reads only the caller's own checklist (RLS-scoped).
 */
import { NextResponse } from 'next/server';
import { anthropic, CHAT_MODEL, NOT_ADVICE_RULE, parseJsonObject, textOf } from '@/lib/ai';
import { buildPillarEvidence } from '@/lib/ai-context';
import { computeReadiness } from '@/lib/readiness';
import { getApplication, getChecklistEntries } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { PILLAR_LABELS } from '@/lib/types';

export const maxDuration = 60;

interface GapJson {
  weakest_pillar?: string;
  summary?: string;
  pillars?: { pillar?: string; assessment?: string; suggestion?: string }[];
  before_lodging?: string[];
}

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const application = await getApplication();
  if (!application) return NextResponse.json({ error: 'No application' }, { status: 404 });

  const entries = await getChecklistEntries(application.id);
  const readiness = computeReadiness(entries);

  try {
    const msg = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system:
        'You assess how well a set of evidence supports an Australian partner visa ' +
        'application (subclass 820/801, de facto) across the four evidence pillars: ' +
        'financial, household, social, commitment. Thin evidence in any single pillar ' +
        'weakens the whole application, so say plainly which pillar is weakest and what ' +
        'would strengthen it. Judge only the evidence listed — never invent documents. ' +
        NOT_ADVICE_RULE +
        ' Respond with JSON only, no prose, no code fences: ' +
        '{"weakest_pillar":"financial|household|social|commitment",' +
        '"summary":"2-3 sentences",' +
        '"pillars":[{"pillar":"financial","assessment":"1-2 sentences","suggestion":"1 sentence"}],' +
        '"before_lodging":["short actionable string"]}',
      messages: [
        {
          role: 'user',
          content:
            `Computed state — decision-ready: ${readiness.isDecisionReady ? 'yes' : 'no'}; ` +
            `required items ${readiness.requiredDone}/${readiness.requiredTotal}; ` +
            `pillars without any verified item: ${
              readiness.failingPillars.map((p) => PILLAR_LABELS[p]).join(', ') || 'none'
            }.\n\n` +
            `Evidence by pillar:\n${buildPillarEvidence(entries)}\n\n` +
            'Assess each pillar and identify the weakest.',
        },
      ],
    });

    const parsed = parseJsonObject<GapJson>(textOf(msg));
    if (!parsed) {
      return NextResponse.json({ error: 'Could not parse the analysis.' }, { status: 502 });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
