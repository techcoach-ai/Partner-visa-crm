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
import { consumeRateLimit, rateLimitMessage } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const PAGE_SIZE = 100;

/**
 * Lists every object under an application prefix, paginating both levels.
 *
 * Throws rather than returning a short list: a silent truncation here would
 * leave a user's identity documents in the bucket after their account is gone,
 * with no row referencing them — unreachable through the UI and contrary to what
 * the privacy policy promises. Better to abort the deletion and report it.
 */
async function listAllPaths(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
): Promise<string[]> {
  const paths: string[] = [];

  async function listPage(prefix: string, offset: number) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Could not list ${prefix}: ${error.message}`);
    return data ?? [];
  }

  async function walk(prefix: string, depth: number) {
    // Paths are {application_id}/{item_id}/{filename}: two levels below the
    // application. The cap stops a malformed tree causing unbounded recursion.
    if (depth > 2) return;

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const entries = await listPage(prefix, offset);
      for (const entry of entries) {
        const full = `${prefix}/${entry.name}`;
        // Storage returns folders as entries with a null id.
        if (entry.id) paths.push(full);
        else await walk(full, depth + 1);
      }
      if (entries.length < PAGE_SIZE) break;
    }
  }

  await walk(applicationId, 1);
  return paths;
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Bounded per user, counted in the database. Fails closed.
  if (!(await consumeRateLimit('account_delete'))) {
    return NextResponse.json({ error: rateLimitMessage('account_delete') }, { status: 429 });
  }

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

  try {
    for (const app of applications ?? []) {
      const paths = await listAllPaths(supabase, app.id as string);
      // Remove in batches; a single call with thousands of keys can be rejected.
      for (let i = 0; i < paths.length; i += PAGE_SIZE) {
        const batch = paths.slice(i, i + PAGE_SIZE);
        const { error } = await supabase.storage.from(BUCKET).remove(batch);
        if (error) throw new Error(error.message);
      }

      // Confirm the prefix is actually empty before deleting the account. If
      // anything survived, stop: an orphaned identity document is worse than a
      // failed deletion the user can retry.
      const leftover = await listAllPaths(supabase, app.id as string);
      if (leftover.length > 0) {
        throw new Error(`${leftover.length} file(s) could not be removed`);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      {
        error:
          `Could not delete your files (${message}). Your account has NOT been ` +
          `deleted — nothing was removed. Please try again.`,
      },
      { status: 500 },
    );
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
