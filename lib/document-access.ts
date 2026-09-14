'use client';

import { createClient } from '@/lib/supabase/client';
import { decryptBytes, fromBase64, toBase64 } from '@/lib/crypto';
import { BUCKET } from '@/lib/storage';

/**
 * Fetching and decrypting documents in the browser.
 *
 * Plaintext exists only as a local ArrayBuffer and, briefly, as a blob: URL that
 * is revoked as soon as the browser has taken it. It is never uploaded, never
 * cached and never sent anywhere except — when the user explicitly asks for a
 * review — to our own route, which holds it in memory only.
 */

/** Ciphertext for the review route to work with; see REVIEW_MAX_PLAINTEXT_BYTES. */
export const CIPHERTEXT_CONTENT_TYPE = 'application/octet-stream';

export interface StoredDocument {
  id: string;
  file_name: string;
  mime_type: string | null;
  encrypted?: boolean | null;
  iv?: string | null;
  /** Real type, derived in the browser; encrypted rows store octet-stream. */
  displayMimeType?: string;
}

/** Signed URL, minted server-side after an ownership check, valid for 60 seconds. */
async function signedUrlFor(documentId: string): Promise<string> {
  const res = await fetch(`/api/documents/${documentId}/signed-url`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Could not get a link to this file.');
  return json.url as string;
}

/**
 * Returns the document's plaintext bytes.
 *
 * Rows written before encryption was added carry encrypted = false and are
 * fetched as-is, so old uploads keep working.
 */
export async function fetchPlaintext(doc: StoredDocument): Promise<Uint8Array> {
  const url = await signedUrlFor(doc.id);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download this file.');
  const bytes = new Uint8Array(await res.arrayBuffer());

  if (!doc.encrypted) return bytes;

  if (!doc.iv) {
    throw new Error('This file is marked encrypted but has no IV recorded.');
  }

  const key = getSessionKey();
  if (!key) throw new Error('Unlock your documents first.');

  try {
    return await decryptBytes(key, fromBase64(doc.iv), bytes);
  } catch {
    // AES-GCM authenticates, so this means the wrong key or altered bytes.
    throw new Error(
      'Could not decrypt this file. It was encrypted with a different passphrase.',
    );
  }
}

/**
 * The provider owns the key; this module needs it without importing React.
 * Set once on unlock and cleared on lock — module scope, never storage.
 */
let sessionKey: CryptoKey | null = null;
export function setSessionKey(key: CryptoKey | null) {
  sessionKey = key;
}
export function getSessionKey(): CryptoKey | null {
  return sessionKey;
}

/** Opens the decrypted file in a new tab, revoking the object URL afterwards. */
export async function openDocument(doc: StoredDocument): Promise<void> {
  const bytes = await fetchPlaintext(doc);
  const blob = new Blob([bytes as BufferSource], {
    type: doc.displayMimeType || doc.mime_type || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Give the new tab time to take the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Saves the decrypted file.
 *
 * saveAs must be supplied for encrypted documents: doc.file_name holds the
 * random object UUID, so saving under it would produce an extensionless file
 * the operating system cannot open.
 */
export async function downloadDocument(
  doc: StoredDocument,
  saveAs?: string,
): Promise<void> {
  const bytes = await fetchPlaintext(doc);
  const blob = new Blob([bytes as BufferSource], {
    type: doc.displayMimeType || doc.mime_type || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = saveAs || doc.file_name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Uploads ciphertext to storage. Returns the object path. */
export async function uploadCiphertext(
  path: string,
  ciphertext: Uint8Array,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([ciphertext as BufferSource]), {
      contentType: CIPHERTEXT_CONTENT_TYPE,
      upsert: false,
    });
  return error ? { error: error.message } : {};
}

/** Base64 of the decrypted bytes, for the review route. */
export async function plaintextBase64(doc: StoredDocument): Promise<string> {
  return toBase64(await fetchPlaintext(doc));
}
