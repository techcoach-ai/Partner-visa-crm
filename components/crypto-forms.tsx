'use client';

import { useState } from 'react';
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useDocumentCrypto } from '@/components/crypto-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * The passphrase forms, shared by the inline gate on the document screens and
 * by Settings → Security, so the two can never drift apart.
 */

export const MIN_PASSPHRASE = 10;

export function CryptoUnavailableNotice() {
  return (
    <Alert variant="destructive">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Encryption is unavailable in this browser</AlertTitle>
      <AlertDescription>
        Documents are encrypted on your device using Web Crypto, which needs a secure
        connection (HTTPS). Open this site over HTTPS, or use a different browser.
      </AlertDescription>
    </Alert>
  );
}

/** Shown when the encryption record could not be read at all. */
export function CryptoErrorNotice() {
  const { error, refresh } = useDocumentCrypto();
  return (
    <Alert variant="destructive">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Could not check your encryption settings</AlertTitle>
      <AlertDescription>
        <p>{error ?? 'Something went wrong reading your encryption settings.'}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void refresh()}
        >
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function PassphraseSetupForm({ compact = false }: { compact?: boolean }) {
  const { setup } = useDocumentCrypto();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`Use at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      setError('The two passphrases do not match.');
      return;
    }
    if (!acknowledged) {
      setError('Please confirm you understand the passphrase cannot be recovered.');
      return;
    }

    setBusy(true);
    const result = await setup(passphrase);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  return (
    <Card className={compact ? 'border-0 shadow-none' : 'mx-auto max-w-xl'}>
      <CardHeader className={compact ? 'px-0 pt-0' : undefined}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <CardTitle className="text-lg">Set a document passphrase</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Your documents are encrypted on this device before they are uploaded. We
              store only the encrypted version, and the passphrase never leaves your
              browser.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className={compact ? 'px-0 pb-0' : undefined}>
        <Alert variant="warning" className="mb-5">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>There is no way to reset this</AlertTitle>
          <AlertDescription>
            <p>
              Because we never receive your passphrase, nobody — including us — can
              recover it or the documents encrypted with it. If you forget it, the
              uploaded copies are permanently unreadable.
            </p>
            <p className="mt-2 font-medium">
              Keep your original files, and store this passphrase somewhere safe.
            </p>
          </AlertDescription>
        </Alert>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passphrase">Passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              At least {MIN_PASSPHRASE} characters. A few unrelated words is stronger and
              easier to remember than one complicated word.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm passphrase</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 rounded-md border bg-muted/40 p-3">
            <input
              id="ack"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
            />
            <Label htmlFor="ack" className="text-xs font-normal leading-relaxed">
              I understand that if I lose this passphrase, the documents I upload cannot
              be recovered by anyone, and I will keep my original files.
            </Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Setting up…' : 'Set passphrase and continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PassphraseUnlockForm({ compact = false }: { compact?: boolean }) {
  const { unlock } = useDocumentCrypto();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await unlock(passphrase);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setPassphrase('');
    }
  }

  return (
    <Card className={compact ? 'border-0 shadow-none' : 'mx-auto max-w-md'}>
      <CardHeader className={compact ? 'px-0 pt-0' : undefined}>
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <CardTitle className="text-lg">Unlock your documents</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your document passphrase to decrypt files in this tab. You will be
              asked again next time you open the app.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? 'px-0 pb-0' : undefined}>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unlock-passphrase">Passphrase</Label>
            <Input
              id="unlock-passphrase"
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={busy || !passphrase} className="w-full">
            <KeyRound className="h-4 w-4" />
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
