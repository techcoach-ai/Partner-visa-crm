/**
 * Document review route — POST /api/documents/[id]/review
 *
 * Pulls the uploaded file from the private `visa-documents` bucket, sends it to
 * the Anthropic API alongside the requirement it's attached to, and writes the
 * verdict + notes back to the documents row. RLS-scoped to the signed-in user.
 */
import { NextResponse } from 'next/server';
import {
  anthropic,
  BUCKET,
  MAX_REVIEW_FILE_BYTES,
  NOT_ADVICE_RULE,
  parseJsonObject,
  REVIEW_MODEL,
  SUPPORTED_IMAGE_TYPES,
  textOf,
} from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';
import type { AiVerdict } from '@/lib/types';

// Reviewing a PDF with Opus runs well past Vercel's default function limit.
export const maxDuration = 60;

/** Shape of the embedded relations PostgREST returns for the select below. */
interface ReviewDocRow {
  application_item: {
    checklist_item: {
      title: string | null;
      guidance: string | null;
      category: { pillar: string | null } | null;
    } | null;
  } | null;
}

interface ReviewJson {
  verdict?: string;
  notes?: string;
  pillar_strengthened?: string;
}

/** Records a terminal state on the document and returns it to the caller. */
async function settle(
  supabase: ReturnType<typeof createClient>,
  id: string,
  verdict: AiVerdict,
  notes: string,
  status = 200,
) {
  const { error } = await supabase
    .from('documents')
    .update({ ai_verdict: verdict, ai_notes: notes })
    .eq('id', id);

  // A failed write means the UI would show a verdict that was never saved.
  if (error) {
    return NextResponse.json(
      { error: `Review completed but could not be saved: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ verdict, notes }, { status });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // 1) Load the document + its requirement (RLS ensures the user owns it).
  const { data: doc, error } = await supabase
    .from('documents')
    .select(
      `
      id, storage_path, mime_type, file_name, size_bytes,
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
  const mime = doc.mime_type ?? '';

  // 2) Decide up front whether this file can be reviewed at all.
  const isPdf = mime === 'application/pdf';
  const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);

  if (!isPdf && !isImage) {
    // Covers .docx and, importantly, iPhone HEIC photos — which would
    // otherwise be rejected by the API rather than landing here.
    return settle(
      supabase,
      doc.id,
      'pending',
      `Automated review supports PDF, JPEG, PNG, GIF and WebP files. Convert "${doc.file_name}" and re-run.`,
    );
  }

  if (doc.size_bytes && doc.size_bytes > MAX_REVIEW_FILE_BYTES) {
    return settle(
      supabase,
      doc.id,
      'pending',
      `"${doc.file_name}" is too large to review automatically. Split it or reduce it below 20 MB and re-run.`,
    );
  }

  // 3) Download the file bytes.
  const { data: file, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(doc.storage_path);
  if (dlErr || !file) return NextResponse.json({ error: 'Download failed' }, { status: 500 });

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_REVIEW_FILE_BYTES) {
    return settle(
      supabase,
      doc.id,
      'pending',
      `"${doc.file_name}" is too large to review automatically. Split it or reduce it below 20 MB and re-run.`,
    );
  }

  const base64 = Buffer.from(bytes).toString('base64');
  const block = isPdf
    ? {
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mime as (typeof SUPPORTED_IMAGE_TYPES)[number],
          data: base64,
        },
      };

  // 4) Ask the model. JSON only.
  let raw: string;
  try {
    const msg = await anthropic().messages.create({
      model: REVIEW_MODEL,
      // Thinking is on by default and its tokens count against this budget.
      // 700 was not enough to reason and then emit the JSON, which truncated
      // the response and made every review parse as an error.
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
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return settle(supabase, doc.id, 'error', `Review could not be completed: ${message}`);
  }

  // 5) Parse defensively.
  const parsed = parseJsonObject<ReviewJson>(raw);
  const verdict: AiVerdict = ['satisfies', 'partial', 'insufficient'].includes(
    parsed?.verdict ?? '',
  )
    ? (parsed!.verdict as AiVerdict)
    : 'error';

  const notes =
    parsed?.notes ??
    (verdict === 'error' ? 'Could not parse the review output.' : '');

  // 6) Persist.
  return settle(supabase, doc.id, verdict, notes);
}
