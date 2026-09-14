'use client';

import { useEffect, useMemo, useState } from 'react';
import { decryptText } from '@/lib/crypto';
import { useDocumentCrypto } from '@/components/crypto-provider';

/** Shown instead of the UUID whenever the real name cannot be read yet. */
export const BLINDED_NAME_PLACEHOLDER = 'Encrypted document';

export interface NameableDocument {
  id: string;
  file_name: string;
  encrypted?: boolean | null;
  name_cipher?: string | null;
  name_iv?: string | null;
}

/**
 * Resolves display names for a list of documents.
 *
 * Legacy rows (encrypted = false) use file_name directly and render unchanged.
 * Encrypted rows hold a random UUID in file_name, so the real name is decrypted
 * here with the session key. While locked — or if decryption fails — the
 * placeholder is shown; the UUID is never put on screen, because showing it
 * would be worse than useless and invites people to treat it as a name.
 */
export function useDocumentNames(docs: NameableDocument[]) {
  const { key } = useDocumentCrypto();
  const [names, setNames] = useState<Record<string, string>>({});

  // Re-resolve only when the set of encrypted rows or the key actually changes.
  const signature = useMemo(
    () => docs.map((d) => `${d.id}:${d.name_cipher ?? ''}`).join('|'),
    [docs],
  );

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const next: Record<string, string> = {};

      for (const doc of docs) {
        if (!doc.encrypted) {
          next[doc.id] = doc.file_name;
          continue;
        }
        if (!key || !doc.name_cipher || !doc.name_iv) {
          next[doc.id] = BLINDED_NAME_PLACEHOLDER;
          continue;
        }
        try {
          next[doc.id] = await decryptText(key, {
            iv: doc.name_iv,
            ciphertext: doc.name_cipher,
          });
        } catch {
          // Wrong key or altered data. Fall back rather than surfacing the UUID.
          next[doc.id] = BLINDED_NAME_PLACEHOLDER;
        }
      }

      if (!cancelled) setNames(next);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, key]);

  /** Display name for one document, safe to call before decryption finishes. */
  function nameOf(doc: NameableDocument): string {
    return names[doc.id] ?? (doc.encrypted ? BLINDED_NAME_PLACEHOLDER : doc.file_name);
  }

  return { names, nameOf };
}
