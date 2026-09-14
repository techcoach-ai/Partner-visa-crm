'use client';

import { useDocumentCrypto } from '@/components/crypto-provider';
import {
  CryptoErrorNotice,
  CryptoUnavailableNotice,
  PassphraseSetupForm,
  PassphraseUnlockForm,
} from '@/components/crypto-forms';

/**
 * Wraps the document surfaces. Everything else in the app works without a
 * passphrase — only uploading, opening and reviewing files need one, so the
 * prompt appears where it is actually required rather than blocking the app.
 *
 * The same forms are reachable deliberately from Settings → Security, for
 * anyone who wants to set up or unlock before going near a document.
 */
export function CryptoGate({ children }: { children: React.ReactNode }) {
  const { status } = useDocumentCrypto();

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Checking encryption…</p>;
  }
  if (status === 'unavailable') return <CryptoUnavailableNotice />;
  // A failed load is reported as a failure. It is never shown as "locked",
  // which would offer an unlock form with no salt behind it.
  if (status === 'error') return <CryptoErrorNotice />;
  if (status === 'needs-setup') return <PassphraseSetupForm />;
  if (status === 'locked') return <PassphraseUnlockForm />;
  return <>{children}</>;
}
