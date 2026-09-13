/**
 * Document review route — POST /api/documents/[id]/review
 * Repo location: app/api/documents/[id]/review/route.ts
 *
 * Pulls the uploaded file from the private `visa-documents` bucket, sends it to
 * the Anthropic API alongside the requirement it's attached to, and writes the
 * verdict + notes back to the documents row. RLS-scoped to the signed-in user.
 *
 * Assumes a standard Supabase App Router server client at @/lib/supabase/server
 * (createClient() using @supabase/ssr + cookies). CC will wire this if absent.
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

// Bump to the current Opus as available (e.g. claude-opus-4-8). Opus is worth it
// for vision/document review; Sonnet is fine for the chat assistant elsewhere.
const MODEL = 'claude-opus-4-5';
const BUCKET = 'visa-documents';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  // 1) Load the document + its requirement (RLS ensures the user owns it).
  const { data: doc, error } = await supabase
    .from('documents')
    .select(`
      id, storage_path, mime_type, file_name,
      application_item:application_items (
        checklist_item:checklist_items ( title, guidance, category:checklist_categories ( pillar ) )
      )
    `)
    .eq('id', params.id)
    .single();

  if (error || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const item = (doc as any).application_item?.checklist_item;
  const requirement = item?.title ?? 'the attached requirement';
  const guidance = item?.guidance ?? '';
  const pillar = item?.category?.pillar ?? 'admin';

  // 2) Download the file bytes.
  const { data: file, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(doc.storage_path);
  if (dlErr || !file) return NextResponse.json({ error: 'Download failed' }, { status: 500 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const mime = doc.mime_type ?? '';

  // 3) Build the content block by type. Only PDF + images can be sent directly.
  let block: any;
  if (mime === 'application/pdf') {
    block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  } else if (mime.startsWith('image/')) {
    block = { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };
  } else {
    // e.g. .docx — needs conversion first. Don't guess a verdict.
    await supabase.from('documents').update({
      ai_verdict: 'pending',
      ai_notes: `Automated review supports PDF and image files. Convert "${doc.file_name}" to PDF and re-run.`,
    }).eq('id', doc.id);
    return NextResponse.json({ verdict: 'pending', notes: 'Unsupported file type for review.' });
  }

  // 4) Ask the model. JSON only.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      'You review evidence for an Australian partner visa (subclass 820/801, de facto). ' +
      'Judge how well a single document supports one specific requirement across the four ' +
      'evidence pillars (financial, household, social, commitment). Be concrete and honest ' +
      'about weaknesses (e.g. single-name where joint is stronger, undated, out of date range). ' +
      'You are not a migration agent and must not give migration advice. ' +
      'Respond with JSON only, no prose, no code fences: ' +
      '{"verdict":"satisfies|partial|insufficient","notes":"1-3 sentences","pillar_strengthened":"financial|household|social|commitment|none"}',
    messages: [{
      role: 'user',
      content: [
        block,
        { type: 'text', text: `Requirement: ${requirement}\nGuidance: ${guidance}\nPillar: ${pillar}\n\nAssess this document against the requirement above.` },
      ],
    }],
  });

  // 5) Parse defensively.
  const raw = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim();
  let parsed: { verdict?: string; notes?: string; pillar_strengthened?: string } = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    parsed = { verdict: 'error', notes: 'Could not parse review output.' };
  }

  const verdict = ['satisfies', 'partial', 'insufficient'].includes(parsed.verdict ?? '')
    ? parsed.verdict : 'error';

  // 6) Persist.
  await supabase.from('documents').update({
    ai_verdict: verdict,
    ai_notes: parsed.notes ?? null,
  }).eq('id', doc.id);

  return NextResponse.json({ verdict, notes: parsed.notes ?? null, pillar: parsed.pillar_strengthened ?? null });
}
