/**
 * Document review route — POST /api/documents/[id]/review
 *
 * Documents are encrypted in the browser, so the server cannot read them from
 * storage any more. The client decrypts locally and posts the plaintext as
 * base64; this route forwards it to the Anthropic API **in memory** and saves
 * only the verdict and notes.
 *
 * The plaintext is never written to storage, never written to disk, and never
 * logged. It exists for the life of this request and nowhere else.
 *
 * A consequence of end-to-end encryption worth naming: the server cannot verify
 * that the bytes it is given are the bytes held in storage for this document.
 * Only the holder of the passphrase could, and they are the one sending them.
 * The review is advisory and attached to a row the caller already owns, so this
 * buys an attacker nothing but a review of their own file.
 */
import { NextResponse } from 'next/server';
import {
  anthropic,
  NOT_ADVICE_RULE,
  parseJsonObject,
  REVIEW_MODEL,
  textOf,
} from '@/lib/ai';
import { consumeRateLimit, rateLimitMessage } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { REVIEW_MAX_PLAINTEXT_BYTES, isAllowedMimeType } from '@/lib/storage';
import type { AiVerdict } from '@/lib/types';

export const maxDuration = 60;

interface ReviewJson {
  verdict?: string;
  notes?: string;
  pillar_strengthened?: string;
}

interface ReviewDocRow {
  application_item: {
    checklist_item: {
      title: string | null;
      guidance: string | null;
      category: { pillar: string | null } | null;
    } | null;
  } | null;
}

/** Records a terminal state on the document and returns it to the caller. */
async function settle(
  supabase: ReturnType<typeof createClient>,
  id: string,
  verdict: AiVerdict,
  notes: string,
) {
  const { error } = await supabase
    .from('documents')
    .update({ ai_verdict: verdict, ai_notes: notes })
    .eq('id', id)
    .select('id');

  if (error) {
    return NextResponse.json(
      { error: 'Review completed but could not be saved.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ verdict, notes });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Bounded per user, counted in the database. Fails closed.
  if (!(await consumeRateLimit('review'))) {
    return NextResponse.json({ error: rateLimitMessage('review') }, { status: 429 });
  }

  // 1) The requirement this document is filed against. RLS proves ownership:
  //    a row that comes back belongs to the caller.
  const { data: doc, error } = await supabase
    .from('documents')
    .select(
      `
      id, file_name, encrypted, mime_type,
      application_item:application_items (
        checklist_item:checklist_items ( title, guidance, category:checklist_categories ( pillar ) )
      )
    `,
    )
    .eq('id', params.id)
    .single();

  if (error || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const item = (doc as unknown as ReviewDocRow).application_item?.checklist_item;
  const requirement = item?.title ?? 'the attached requirement';
  const guidance = item?.guidance ?? '';
  const pillar = item?.category?.pillar ?? 'admin';

  // 2) The plaintext, supplied by the client because only it can decrypt.
  const body = await req.json().catch(() => null);
  const dataBase64 = typeof body?.data === 'string' ? body.data : '';
  const postedMime = typeof body?.mimeType === 'string' ? body.mimeType : '';

  if (!dataBase64) {
    return NextResponse.json({ error: 'No document content was sent.' }, { status: 400 });
  }

  const encrypted = Boolean(doc.encrypted);

  // For an encrypted document the stored mime_type is 'application/octet-stream'
  // by design — the real type is blinded along with the filename. It can only
  // come from the client, which decrypted the file to send it. Legacy rows keep
  // falling back to the stored value.
  const mime = encrypted ? postedMime : postedMime || (doc.mime_type as string) || '';

  // file_name holds the random object UUID for an encrypted row, so it must not
  // appear in a message — it would be stored in ai_notes and shown to the user.
  const describe = encrypted ? 'This document' : `"${doc.file_name}"`;

  if (!isAllowedMimeType(mime)) {
    return settle(
      supabase,
      doc.id as string,
      'pending',
      `Automated review supports PDF, JPEG, PNG, GIF and WebP files. ${describe} could not be identified — convert it and re-run.`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataBase64, 'base64');
  } catch {
    return NextResponse.json({ error: 'Document content was malformed.' }, { status: 400 });
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: 'Document content was empty.' }, { status: 400 });
  }
  if (bytes.byteLength > REVIEW_MAX_PLAINTEXT_BYTES) {
    return settle(
      supabase,
      doc.id as string,
      'pending',
      `${describe} is too large to review automatically (limit 3 MB). It is stored safely — only the review is limited.`,
    );
  }

  const isPdf = mime === 'application/pdf';
  const block = isPdf
    ? {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: dataBase64,
        },
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: dataBase64,
        },
      };

  // 3) Ask the model. JSON only.
  let raw: string;
  try {
    const msg = await anthropic().messages.create({
      model: REVIEW_MODEL,
      // Thinking is on by default and its tokens share this budget; too small a
      // number truncates the JSON and every review parses as an error.
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system:
        'You review evidence for an Australian partner visa (subclass 309/100, offshore, de facto). ' +
        'Judge how well a single document supports one specific requirement across the four ' +
        'evidence pillars (financial, household, social, commitment). Be concrete and honest ' +
        'about weaknesses (e.g. single-name where joint is stronger, undated, out of date range). ' +
        NOT_ADVICE_RULE +
        ' Respond with JSON only, no prose, no code fences: ' +
        '{"verdict":"satisfies|partial|insufficient","notes":"1-3 sentences","pillar_strengthened":"financial|household|social|commitment|none"}',
      messages: [
        {
          role: 'user',
          content: [
            block,
            {
              type: 'text',
              text: `Requirement: ${requirement}\nGuidance: ${guidance}\nPillar: ${pillar}\n\nAssess this document against the requirement above.`,
            },
          ],
        },
      ],
    });
    raw = textOf(msg);
  } catch {
    // Deliberately not echoing the provider error: it can quote request content.
    return settle(
      supabase,
      doc.id as string,
      'error',
      'Review could not be completed. Try again shortly.',
    );
  }

  // 4) Parse defensively.
  const parsed = parseJsonObject<ReviewJson>(raw);
  const verdict: AiVerdict = ['satisfies', 'partial', 'insufficient'].includes(
    parsed?.verdict ?? '',
  )
    ? (parsed!.verdict as AiVerdict)
    : 'error';

  const notes =
    parsed?.notes ?? (verdict === 'error' ? 'Could not parse the review output.' : '');

  // 5) Persist the verdict only. The plaintext goes out of scope here and is
  //    never written anywhere.
  return settle(supabase, doc.id as string, verdict, notes);
}
