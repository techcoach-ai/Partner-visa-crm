'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ItemStatus } from '@/lib/types';

const VALID_STATUSES: ItemStatus[] = [
  'not_started',
  'in_progress',
  'uploaded',
  'verified',
  'not_applicable',
];

/** RLS scopes the update to the caller's own rows; no ownership check needed here. */
export async function setItemStatus(entryId: string, status: ItemStatus) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: 'Unknown status.' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('application_items')
    .update({ status })
    .eq('id', entryId);

  if (error) return { error: error.message };

  revalidatePath('/checklist');
  revalidatePath(`/checklist/${entryId}`);
  revalidatePath('/dashboard');
  return {};
}

export async function setItemNotes(entryId: string, notes: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('application_items')
    .update({ notes: notes.trim() || null })
    .eq('id', entryId);

  if (error) return { error: error.message };

  revalidatePath(`/checklist/${entryId}`);
  return {};
}

/** Deletes a document row and its stored file. */
export async function deleteDocument(documentId: string) {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path, application_item_id')
    .eq('id', documentId)
    .single();

  if (!doc) return { error: 'Document not found.' };

  // Remove the object first. If the row went first and this failed, the file
  // would be orphaned in the bucket with nothing pointing at it.
  const { error: storageError } = await supabase.storage
    .from('visa-documents')
    .remove([doc.storage_path]);
  if (storageError) return { error: storageError.message };

  const { error } = await supabase.from('documents').delete().eq('id', documentId);
  if (error) return { error: error.message };

  revalidatePath(`/checklist/${doc.application_item_id}`);
  revalidatePath('/checklist');
  revalidatePath('/dashboard');
  return {};
}
