'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { setSessionKey } from '@/lib/document-access';
import {
  classifyCryptoState,
  isCompleteRecord,
  looksLikeMissingTable,
  looksLikeStaleSchemaCache,
  type CryptoStatus,
  type UserCryptoRecord,
} from '@/lib/crypto-state';
import {
  PBKDF2_ITERATIONS,
  checkVerifier,
  deriveKey,
  fromBase64,
  makeVerifier,
  randomSalt,
  toBase64,
} from '@/lib/crypto';

export type { CryptoStatus } from '@/lib/crypto-state';

interface CryptoContextValue {
  status: CryptoStatus;
  /** Present only while unlocked. Held in memory for this tab, never persisted. */
  key: CryptoKey | null;
  error: string | null;
  setup: (passphrase: string) => Promise<{ error?: string }>;
  unlock: (passphrase: string) => Promise<{ error?: string }>;
  lock: () => void;
  refresh: () => Promise<void>;
}

const CryptoContext = React.createContext<CryptoContextValue | null>(null);

export function useDocumentCrypto() {
  const ctx = React.useContext(CryptoContext);
  if (!ctx) throw new Error('useDocumentCrypto must be used within CryptoProvider');
  return ctx;
}

/**
 * Turns a failed read of user_crypto into something the reader can act on.
 *
 * The raw code and message are ALWAYS appended, and so is the project this
 * build is pointed at. Summarising the error and hiding the original cost
 * several rounds of guessing: "not installed" and "the API cannot see it yet"
 * look identical from here, and so does "you are looking at a different
 * project from the one you ran the SQL in". The Supabase URL is public by
 * design — it ships in the browser bundle — so showing it reveals nothing.
 */
function describeLoadError(error: { code?: string | null; message?: string | null }): string {
  const project = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host;
    } catch {
      return 'unknown project';
    }
  })();

  const raw = `[${error.code ?? 'no code'}] ${error.message ?? 'no message'} — project: ${project}`;

  if (looksLikeStaleSchemaCache(error)) {
    return (
      'The database has the encryption tables, but the API has not picked them up yet. ' +
      "Run `notify pgrst, 'reload schema';` in the Supabase SQL editor, or restart the " +
      `project under Settings → General, then reload this page.\n\n${raw}`
    );
  }
  if (looksLikeMissingTable(error)) {
    return (
      'The API reports that user_crypto does not exist. If you have already run the ' +
      'migration, check that this project is the same one you ran it in, and that the ' +
      `table is in the public schema.\n\n${raw}`
    );
  }
  return `Could not load your encryption settings.\n\n${raw}`;
}

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  // Facts, not status. The status is derived below, so no branch can set a
  // state the facts do not support.
  const [loaded, setLoaded] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [record, setRecord] = React.useState<Partial<UserCryptoRecord> | null>(null);
  const [key, setKey] = React.useState<CryptoKey | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cryptoAvailable, setCryptoAvailable] = React.useState(true);

  React.useEffect(() => {
    setCryptoAvailable(Boolean(window.crypto?.subtle));
  }, []);

  const status = React.useMemo(
    () =>
      classifyCryptoState({
        loaded,
        cryptoAvailable,
        loadFailed,
        record,
        hasKey: key !== null,
      }),
    [loaded, cryptoAvailable, loadFailed, record, key],
  );

  const refresh = React.useCallback(async () => {
    if (typeof window !== 'undefined' && !window.crypto?.subtle) {
      setCryptoAvailable(false);
      setLoaded(true);
      return;
    }

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from('user_crypto')
      .select('salt, iterations, verifier_iv, verifier_ct')
      .maybeSingle();

    if (loadError) {
      // Never fall through to 'locked': a failed read says nothing about
      // whether setup has happened, and guessing wrong leaves a first-time user
      // on an unlock form they cannot possibly complete.
      setLoadFailed(true);
      setRecord(null);
      setError(describeLoadError(loadError));
      setLoaded(true);
      return;
    }

    setLoadFailed(false);
    setError(null);
    // A row missing any field means setup never completed; classifyCryptoState
    // treats that as needs-setup rather than offering an impossible unlock.
    setRecord(data ?? null);
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const setup = React.useCallback(async (passphrase: string) => {
    setError(null);
    try {
      const salt = randomSalt();
      const derived = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
      const verifier = await makeVerifier(derived);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { error: 'You are not signed in.' };

      // One INSERT with every column, so the row is either complete or absent —
      // there is no window in which a salt exists without its verifier. The
      // columns are NOT NULL and non-empty-checked, so the database enforces it
      // too.
      const row = {
        user_id: user.id,
        salt: toBase64(salt),
        iterations: PBKDF2_ITERATIONS,
        verifier_iv: verifier.iv,
        verifier_ct: verifier.ciphertext,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('user_crypto')
        .insert(row)
        .select('salt, iterations, verifier_iv, verifier_ct')
        .single();

      if (insertError || !inserted) {
        if (looksLikeMissingTable(insertError)) {
          return {
            error:
              'Document encryption is not installed on this database yet. Run migrations/2026-09-14-e2e-encryption.sql in the Supabase SQL editor.',
          };
        }
        // There is no update policy, so a conflict means a passphrase already
        // exists — overwriting would strand every document already uploaded.
        return {
          error:
            'Encryption is already set up for this account. Reload the page and unlock instead.',
        };
      }

      setRecord(inserted as UserCryptoRecord);
      setLoadFailed(false);
      setLoaded(true);
      setKey(derived);
      setSessionKey(derived);
      return {};
    } catch {
      return { error: 'Could not set up encryption in this browser.' };
    }
  }, []);

  const unlock = React.useCallback(
    async (passphrase: string) => {
      setError(null);

      // Guard on completeness, not mere presence: a partial row cannot derive a
      // key, and the user needs to be told to set up rather than to retype.
      if (!isCompleteRecord(record)) {
        return {
          error: 'Encryption is not set up on this account yet — create a passphrase first.',
        };
      }

      try {
        const derived = await deriveKey(
          passphrase,
          fromBase64(record.salt),
          record.iterations,
        );

        // AES-GCM authenticates, so a wrong passphrase fails here rather than
        // producing garbage on the first document the user opens.
        const ok = await checkVerifier(derived, {
          iv: record.verifier_iv,
          ciphertext: record.verifier_ct,
        });
        if (!ok) return { error: 'That passphrase is not right. Try again.' };

        setKey(derived);
        setSessionKey(derived);
        return {};
      } catch {
        return { error: 'Could not unlock with that passphrase.' };
      }
    },
    [record],
  );

  const lock = React.useCallback(() => {
    setKey(null);
    setSessionKey(null);
  }, []);

  const value = React.useMemo<CryptoContextValue>(
    () => ({ status, key, error, setup, unlock, lock, refresh }),
    [status, key, error, setup, unlock, lock, refresh],
  );

  return <CryptoContext.Provider value={value}>{children}</CryptoContext.Provider>;
}
