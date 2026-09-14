/**
 * Short-lived signed URL for a private document — GET /api/documents/[id]/signed-url
 *
 * The bucket is private and has no public URLs. RLS on the documents row is
 * what proves the caller owns the file before a link is minted.
 */
import { NextResponse } from 'next/server';
import { BUCKET } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

const EXPIRES_SECONDS = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: doc, error } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', params.id)
    .single();

  if (error || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, EXPIRES_SECONDS);

  if (signError || !data) {
    return NextResponse.json({ error: 'Could not create link' }, { status: 500 });
  }

  // Never let a shared cache or proxy retain a link to an identity document.
  return NextResponse.json(
    { url: data.signedUrl, expiresIn: EXPIRES_SECONDS },
    { headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' } },
  );
}
