'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { setSessionKey } from '@/lib/document-access';
import {
  PBKDF2_ITERATIONS,
  checkVerifier,
  deriveKey,
  fromBase64,
  makeVerifier,
  randomSalt,
  toBase64,
  type UserCryptoRecord,
} from '@/lib/crypto';

export type CryptoStatus =
  | 'loading'
  | 'needs-setup'
  | 'locked'
  | 'unlocked'
  | 'unavailable';

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

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<CryptoStatus>('loading');
  const [key, setKey] = React.useState<CryptoKey | null>(null);
  const [record, setRecord] = React.useState<UserCryptoRecord | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (typeof window !== 'undefined' && !window.crypto?.subtle) {
      // Web Crypto needs a secure context. Say so rather than failing obscurely.
      setStatus('unavailable');
      return;
    }

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from('user_crypto')
      .select('salt, iterations, verifier_iv, verifier_ct')
      .maybeSingle();

    if (loadError) {
      setError('Could not load your encryption settings.');
      setStatus('locked');
      return;
    }

    if (!data) {
      setRecord(null);
      setStatus('needs-setup');
      return;
    }

    setRecord(data as UserCryptoRecord);
    setStatus((prev) => (prev === 'unlocked' ? 'unlocked' : 'locked'));
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const setup = React.useCallback(
    async (passphrase: string) => {
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

        const row = {
          user_id: user.id,
          salt: toBase64(salt),
          iterations: PBKDF2_ITERATIONS,
          verifier_iv: verifier.iv,
          verifier_ct: verifier.ciphertext,
        };

        const { error: insertError } = await supabase.from('user_crypto').insert(row);
        if (insertError) {
          // There is no update policy, so a conflict means it already exists —
          // overwriting would strand every document already uploaded.
          return {
            error:
              'Encryption is already set up for this account. Reload and unlock instead.',
          };
        }

        setRecord({
          salt: row.salt,
          iterations: row.iterations,
          verifier_iv: row.verifier_iv,
          verifier_ct: row.verifier_ct,
        });
        setKey(derived);
        setSessionKey(derived);
        setStatus('unlocked');
        return {};
      } catch {
        return { error: 'Could not set up encryption in this browser.' };
      }
    },
    [],
  );

  const unlock = React.useCallback(
    async (passphrase: string) => {
      setError(null);
      if (!record) return { error: 'Encryption is not set up yet.' };

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
        setStatus('unlocked');
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
    setStatus((prev) => (prev === 'unlocked' ? 'locked' : prev));
  }, []);

  const value = React.useMemo<CryptoContextValue>(
    () => ({ status, key, error, setup, unlock, lock, refresh }),
    [status, key, error, setup, unlock, lock, refresh],
  );

  return <CryptoContext.Provider value={value}>{children}</CryptoContext.Provider>;
}
