/**
 * Statement drafter — POST /api/drafter
 *
 * Turns a relationship timeline into first drafts of the applicant's and
 * sponsor's personal statements. Nothing is stored or submitted: the drafts
 * are returned for the user to edit and use as they see fit.
 */
import { NextResponse } from 'next/server';
import { anthropic, CHAT_MODEL, NOT_ADVICE_RULE, parseJsonObject, textOf } from '@/lib/ai';
import { getApplication } from '@/lib/queries';
import { consumeRateLimit, rateLimitMessage } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;

const MAX_TIMELINE_CHARS = 12000;

interface DraftJson {
  applicant_statement?: string;
  sponsor_statement?: string;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Bounded per user, counted in the database. Fails closed.
  if (!(await consumeRateLimit('drafter'))) {
    return NextResponse.json({ error: rateLimitMessage('drafter') }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const timeline = typeof body?.timeline === 'string' ? body.timeline.trim() : '';
  const howMet = typeof body?.how_met === 'string' ? body.how_met.trim() : '';
  const livingTogether =
    typeof body?.living_together === 'string' ? body.living_together.trim() : '';

  if (!timeline) {
    return NextResponse.json(
      { error: 'Add your relationship timeline before drafting.' },
      { status: 400 },
    );
  }
  if (timeline.length > MAX_TIMELINE_CHARS) {
    return NextResponse.json({ error: 'That timeline is too long.' }, { status: 400 });
  }

  const application = await getApplication();
  if (!application) return NextResponse.json({ error: 'No application' }, { status: 404 });

  try {
    const msg = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system:
        'You draft personal statements for an Australian partner visa application ' +
        '(subclass 309/100, offshore, de facto). Write two first-person statements: one from the ' +
        'applicant and one from the sponsor.\n\n' +
        'Rules:\n' +
        '- Use ONLY facts the user supplied. Never invent dates, places, events, names ' +
        'or details. If something important is missing, write a clearly marked ' +
        '[bracketed placeholder] for the user to fill in.\n' +
        '- The two statements must corroborate each other without copying: same events, ' +
        'genuinely different voice, perspective and emphasis.\n' +
        '- Cover all four evidence pillars where the material allows: financial, ' +
        'household, social, commitment.\n' +
        '- Plain, sincere, specific. No flowery language, no legal argument, no ' +
        'assertions about whether the relationship meets any legal test.\n' +
        NOT_ADVICE_RULE +
        '\n\nRespond with JSON only, no prose, no code fences: ' +
        '{"applicant_statement":"...","sponsor_statement":"..."}',
      messages: [
        {
          role: 'user',
          content:
            `Applicant: ${application.applicant_name ?? '[applicant name]'}\n` +
            `Sponsor: ${application.sponsor_name ?? '[sponsor name]'}\n\n` +
            (howMet ? `How they met:\n${howMet}\n\n` : '') +
            (livingTogether ? `Living together:\n${livingTogether}\n\n` : '') +
            `Relationship timeline and details:\n${timeline}`,
        },
      ],
    });

    const parsed = parseJsonObject<DraftJson>(textOf(msg));
    if (!parsed?.applicant_statement || !parsed?.sponsor_statement) {
      return NextResponse.json(
        { error: 'The drafter returned an unusable response. Try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      applicant_statement: parsed.applicant_statement,
      sponsor_statement: parsed.sponsor_statement,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
