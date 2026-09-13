/**
 * Grounded Q&A — POST /api/assistant
 *
 * Answers from the user's own checklist and the published visa rules, and
 * persists both sides of the exchange to ai_messages.
 */
import { NextResponse } from 'next/server';
import { anthropic, CHAT_MODEL, NOT_ADVICE_RULE, textOf } from '@/lib/ai';
import { buildGroundingContext } from '@/lib/ai-context';
import { getApplication, getChecklistEntries } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const MAX_QUESTION_CHARS = 4000;
/** Prior turns replayed for context. */
const HISTORY_LIMIT = 20;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: 'That question is too long.' }, { status: 400 });
  }

  const application = await getApplication();
  if (!application) return NextResponse.json({ error: 'No application' }, { status: 404 });

  const entries = await getChecklistEntries(application.id);

  const { data: history } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('application_id', application.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  const priorTurns = (history ?? [])
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  let answer: string;
  try {
    const msg = await anthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system:
        'You help someone assemble their own Australian partner visa application ' +
        '(subclass 820/801, de facto). Answer ONLY from the checklist and rules given ' +
        'below. If the answer is not in that material, say so plainly and point them to ' +
        'immi.homeaffairs.gov.au rather than guessing. Never invent a requirement, a fee, ' +
        'a processing time or a form number. Be brief and concrete. ' +
        NOT_ADVICE_RULE +
        '\n\n' +
        buildGroundingContext(entries),
      messages: [...priorTurns, { role: 'user', content: question }],
    });
    answer = textOf(msg);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!answer) {
    return NextResponse.json({ error: 'The assistant returned nothing.' }, { status: 502 });
  }

  const { error: writeError } = await supabase.from('ai_messages').insert([
    { application_id: application.id, role: 'user', content: question },
    { application_id: application.id, role: 'assistant', content: answer },
  ]);

  return NextResponse.json({
    answer,
    // The answer is still worth showing even if the transcript write failed.
    warning: writeError ? 'This exchange could not be saved to your history.' : undefined,
  });
}
