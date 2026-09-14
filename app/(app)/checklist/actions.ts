'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BUCKET } from '@/lib/storage';
import type { ItemStatus } from '@/lib/types';

const VALID_STATUSES: ItemStatus[] = [
  'not_started',
  'in_progress',
  'uploaded',
  'verified',
  'not_applicable',
];

const MAX_NOTES_CHARS = 5000;

type ActionResult = { error?: string };

/**
 * Server Actions are publicly reachable POST endpoints, so each one
 * authenticates before touching the database. RLS is still the boundary that
 * enforces ownership — this is the layer in front of it, so an unauthenticated
 * or non-owning caller is rejected here rather than silently denied downstream.
 */
async function requireUserClient() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Confirms the checklist row belongs to the caller and returns its application
 * and template item ids. RLS scopes the select, so a row that comes back is by
 * definition theirs; a row that does not is indistinguishable from one that
 * does not exist, which is the correct thing to tell the caller.
 */
async function loadOwnedEntry(
  supabase: ReturnType<typeof createClient>,
  entryId: string,
) {
  const { data } = await supabase
    .from('application_items')
    .select('id, application_id, item_id')
    .eq('id', entryId)
    .maybeSingle();
  return data as { id: string; application_id: string; item_id: string } | null;
}

export async function setItemStatus(
  entryId: string,
  status: ItemStatus,
): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(status)) return { error: 'Unknown status.' };

  const { supabase, user } = await requireUserClient();
  if (!user) return { error: 'Not signed in.' };

  const entry = await loadOwnedEntry(supabase, entryId);
  if (!entry) return { error: 'Item not found.' };

  // Select back the id: a PostgREST update matching zero rows returns no error,
  // so without this an RLS denial would be reported to the caller as success.
  const { data, error } = await supabase
    .from('application_items')
    .update({ status })
    .eq('id', entryId)
    .select('id');

  if (error) return { error: 'Could not update this item.' };
  if (!data || data.length === 0) return { error: 'Item not found.' };

  revalidatePath('/checklist');
  revalidatePath(`/checklist/${entryId}`);
  revalidatePath('/dashboard');
  return {};
}

export async function setItemNotes(
  entryId: string,
  notes: string,
): Promise<ActionResult> {
  if (notes.length > MAX_NOTES_CHARS) return { error: 'Those notes are too long.' };

  const { supabase, user } = await requireUserClient();
  if (!user) return { error: 'Not signed in.' };

  const entry = await loadOwnedEntry(supabase, entryId);
  if (!entry) return { error: 'Item not found.' };

  const { data, error } = await supabase
    .from('application_items')
    .update({ notes: notes.trim() || null })
    .eq('id', entryId)
    .select('id');

  if (error) return { error: 'Could not save your notes.' };
  if (!data || data.length === 0) return { error: 'Item not found.' };

  revalidatePath(`/checklist/${entryId}`);
  return {};
}

/**
 * Records an uploaded file against a checklist item.
 *
 * The browser uploads the bytes directly to Storage — proxying 20 MB through a
 * function would be wasteful — but the database row is written here, where the
 * path can be checked. The caller supplies a path; this verifies it sits under
 * the folder for an item the caller owns, so a row can never be made to point
 * at another user's file. The database trigger enforces the same rule, so the
 * two are independent.
 */
export async function recordDocument(input: {
  entryId: string;
  storagePath: string;
  /**
   * For an encrypted upload this is the random UUID used as the object name —
   * never the user's filename, which is blinded into nameCipher instead.
   * For a legacy unencrypted upload it is the real filename.
   */
  fileName: string;
  /** Ignored for encrypted uploads, which are always stored as octet-stream. */
  mimeType: string;
  /** Plaintext length, so the UI can show a true size. */
  sizeBytes: number;
  encrypted: boolean;
  /** base64, required when encrypted. */
  iv: string | null;
  /** base64 ciphertext of the real display name; required when encrypted. */
  nameCipher?: string | null;
  /** base64 IV for nameCipher; required when encrypted. */
  nameIv?: string | null;
}): Promise<ActionResult & { documentId?: string }> {
  const { supabase, user } = await requireUserClient();
  if (!user) return { error: 'Not signed in.' };

  const entry = await loadOwnedEntry(supabase, input.entryId);
  if (!entry) return { error: 'Item not found.' };

  const expectedPrefix = `${entry.application_id}/${entry.item_id}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) {
    return { error: 'That file path is not valid for this item.' };
  }

  // An encrypted row without its IV is unrecoverable data. The database has the
  // same constraint; this is the layer that gives a readable error.
  if (input.encrypted && !input.iv) {
    return { error: 'Encrypted uploads must record their IV.' };
  }
  if (input.encrypted && (!input.nameCipher || !input.nameIv)) {
    return { error: 'Encrypted uploads must record their blinded filename.' };
  }

  // Blinding is enforced here rather than trusted from the caller: for an
  // encrypted upload the stored name must be the opaque object name and the
  // stored type must be octet-stream, whatever the client sent. A client bug
  // that passed the real filename through must not be able to persist it.
  const blindedName = input.encrypted
    ? input.storagePath.slice(expectedPrefix.length)
    : input.fileName.slice(0, 255);

  if (input.encrypted && !blindedName) {
    return { error: 'That file path is not valid for this item.' };
  }

  const storedMimeType = input.encrypted
    ? 'application/octet-stream'
    : input.mimeType || null;

  const { data, error } = await supabase
    .from('documents')
    .insert({
      application_item_id: entry.id,
      storage_path: input.storagePath,
      file_name: blindedName,
      mime_type: storedMimeType,
      size_bytes: input.sizeBytes,
      encrypted: input.encrypted,
      iv: input.iv,
      name_cipher: input.encrypted ? input.nameCipher : null,
      name_iv: input.encrypted ? input.nameIv : null,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'Could not record this document.' };

  revalidatePath(`/checklist/${input.entryId}`);
  revalidatePath('/checklist');
  revalidatePath('/documents');
  revalidatePath('/dashboard');
  return { documentId: data.id as string };
}

/** Deletes a document row and its stored object. */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUserClient();
  if (!user) return { error: 'Not signed in.' };

  // RLS scopes this select, so getting a row back proves ownership.
  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path, application_item_id')
    .eq('id', documentId)
    .maybeSingle();

  if (!doc) return { error: 'Document not found.' };

  // Remove the object first: if the row went first and this failed, the file
  // would remain in the bucket with nothing pointing at it.
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([doc.storage_path as string]);
  if (storageError) return { error: 'Could not delete the stored file.' };

  const { data: deleted, error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .select('id');

  if (error) return { error: 'Could not delete this document.' };
  if (!deleted || deleted.length === 0) return { error: 'Document not found.' };

  revalidatePath(`/checklist/${doc.application_item_id}`);
  revalidatePath('/checklist');
  revalidatePath('/documents');
  revalidatePath('/dashboard');
  return {};
}
