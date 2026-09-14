import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Application, ChecklistEntry } from '@/lib/types';

/** Signed-in user, or redirect to login. */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

/** The user's application, if onboarding has run. RLS scopes this to them. */
export async function getApplication(): Promise<Application | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Application) ?? null;
}

/** The application, or bounce to onboarding if there isn't one yet. */
export async function requireApplication(): Promise<Application> {
  await requireUser();
  const application = await getApplication();
  if (!application) redirect('/onboarding');
  return application;
}

/**
 * Every checklist row for an application, joined to its template item,
 * category and documents.
 *
 * Ordered in JS rather than SQL: PostgREST cannot order a parent by a column
 * on an embedded resource, and the ordering we want (category.sort_order, then
 * item.sort_order) lives entirely on embedded rows.
 */
export async function getChecklistEntries(applicationId: string): Promise<ChecklistEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('application_items')
    .select(
      `
      id, application_id, item_id, status, notes, updated_at,
      checklist_item:checklist_items (
        id, category_id, title, description, applies_to, required,
        form_reference, guidance, sort_order,
        category:checklist_categories ( id, key, name, pillar, description, sort_order )
      ),
      documents ( id, application_item_id, storage_path, file_name, mime_type,
                  size_bytes, ai_verdict, ai_notes, uploaded_at, encrypted, iv,
                  name_cipher, name_iv )
    `,
    )
    .eq('application_id', applicationId);

  if (error) throw new Error(`Failed to load checklist: ${error.message}`);

  const entries = (data ?? []) as unknown as ChecklistEntry[];

  return entries.sort((a, b) => {
    const ca = a.checklist_item?.category?.sort_order ?? 0;
    const cb = b.checklist_item?.category?.sort_order ?? 0;
    if (ca !== cb) return ca - cb;
    return (a.checklist_item?.sort_order ?? 0) - (b.checklist_item?.sort_order ?? 0);
  });
}

/** Groups entries by category, preserving the sorted order. */
export function groupByCategory(entries: ChecklistEntry[]) {
  const groups = new Map<string, { category: ChecklistEntry['checklist_item']['category']; entries: ChecklistEntry[] }>();
  for (const entry of entries) {
    const category = entry.checklist_item?.category;
    if (!category) continue;
    const existing = groups.get(category.id);
    if (existing) existing.entries.push(entry);
    else groups.set(category.id, { category, entries: [entry] });
  }
  return Array.from(groups.values());
}
