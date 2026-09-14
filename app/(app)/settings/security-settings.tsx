'use client';

import { Lock, LockOpen, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useDocumentCrypto } from '@/components/crypto-provider';
import {
  CryptoUnavailableNotice,
  PassphraseSetupForm,
  PassphraseUnlockForm,
} from '@/components/crypto-forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * The discoverable home for document encryption.
 *
 * The same forms also appear inline on the document screens when they are
 * needed there; this gives a user somewhere to go deliberately, and somewhere
 * to see what state they are in without opening a document to find out.
 */
export function SecuritySettings() {
  const { status, lock } = useDocumentCrypto();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Document encryption</CardTitle>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Uploaded documents are encrypted on this device before they are sent. The
          passphrase never leaves your browser, so nobody else — including us — can read
          them.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Checking encryption…</p>
        )}

        {status === 'unavailable' && <CryptoUnavailableNotice />}

        {status === 'needs-setup' && (
          <>
            <Alert>
              <ShieldQuestion className="h-4 w-4" />
              <AlertTitle>Not set up yet</AlertTitle>
              <AlertDescription>
                You need a passphrase before you can upload documents. You can set one
                here, or you will be asked the first time you add a file.
              </AlertDescription>
            </Alert>
            <PassphraseSetupForm compact />
          </>
        )}

        {status === 'locked' && (
          <>
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Locked</AlertTitle>
              <AlertDescription>
                Your documents are encrypted and cannot be read until you unlock. This
                happens every time you open the app in a new tab — the key is held in
                memory only and never written to disk.
              </AlertDescription>
            </Alert>
            <PassphraseUnlockForm compact />
          </>
        )}

        {status === 'unlocked' && (
          <>
            <Alert variant="success">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Unlocked for this tab</AlertTitle>
              <AlertDescription>
                Documents will decrypt when you open them. Closing this tab locks them
                again automatically.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={lock}>
                <Lock className="h-4 w-4" />
                Lock now
              </Button>
              <span className="text-xs text-muted-foreground">
                Clears the key from memory. You will need the passphrase again.
              </span>
            </div>
          </>
        )}

        <Alert variant="warning">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>A lost passphrase cannot be reset</AlertTitle>
          <AlertDescription>
            <p>
              Because the passphrase never reaches our servers, there is no reset link
              and no recovery path. If you forget it, the documents already uploaded are
              permanently unreadable — by you and by us.
            </p>
            <p className="mt-2 font-medium">Keep your original files.</p>
            <p className="mt-2">
              Changing the passphrase is not supported: every document is encrypted with
              the key derived from it, so a new one would leave the existing files
              unreadable. Re-uploading under a new account is the only clean path.
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof useDocumentCrypto>['status'] }) {
  if (status === 'unlocked') {
    return (
      <Badge variant="success" className="gap-1">
        <LockOpen className="h-3 w-3" />
        Unlocked
      </Badge>
    );
  }
  if (status === 'locked') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="h-3 w-3" />
        Locked
      </Badge>
    );
  }
  if (status === 'needs-setup') {
    return <Badge variant="warning">Not set up</Badge>;
  }
  if (status === 'unavailable') {
    return <Badge variant="destructive">Unavailable</Badge>;
  }
  return <Badge variant="outline">Checking…</Badge>;
}
