/**
 * Account deletion — POST /api/account/delete
 *
 * Removes the user's stored files, then deletes the auth user. Deleting the
 * auth user cascades through applications → application_items → documents and
 * ai_messages, but storage objects are NOT covered by that cascade, so they
 * are cleared explicitly first.
 */
import { NextResponse } from 'next/server';
import { BUCKET } from '@/lib/ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/** Lists every object under a prefix, walking the item folders beneath it. */
async function listAllPaths(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
): Promise<string[]> {
  const paths: string[] = [];

  const { data: itemFolders } = await supabase.storage.from(BUCKET).list(applicationId, {
    limit: 1000,
  });

  for (const folder of itemFolders ?? []) {
    // Entries with no id are folders, not objects.
    if (folder.id) {
      paths.push(`${applicationId}/${folder.name}`);
      continue;
    }
    const prefix = `${applicationId}/${folder.name}`;
    const { data: files } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
    for (const file of files ?? []) {
      paths.push(`${prefix}/${file.name}`);
    }
  }

  return paths;
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Require the user to type their email, so this can't fire by accident.
  const body = await req.json().catch(() => null);
  const confirmation = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
  if (confirmation.toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return NextResponse.json(
      { error: 'Type your email address exactly to confirm deletion.' },
      { status: 400 },
    );
  }

  // Delete stored files first, using the user's own client so RLS still applies.
  const { data: applications } = await supabase.from('applications').select('id');

  for (const app of applications ?? []) {
    const paths = await listAllPaths(supabase, app.id as string);
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) {
        return NextResponse.json(
          { error: `Could not delete your files: ${error.message}. Nothing has been removed.` },
          { status: 500 },
        );
      }
    }
  }

  // Deleting the auth user cascades to every table keyed on it.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: 'Account deletion is not configured on this deployment.' },
      { status: 500 },
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json(
      { error: `Could not delete your account: ${deleteError.message}` },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
