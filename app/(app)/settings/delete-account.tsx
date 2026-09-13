'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not delete your account.');
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account.');
      setLoading(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-destructive">Delete your account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This permanently removes your uploaded documents from storage and deletes your
          application, checklist, document records and assistant history, then deletes your
          account. It happens immediately and cannot be undone.
        </p>

        <div className="space-y-2">
          <Label htmlFor="confirm">
            Type <span className="font-mono">{email}</span> to confirm
          </Label>
          <Input
            id="confirm"
            value={confirm}
            autoComplete="off"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          variant="destructive"
          disabled={loading || confirm.trim().toLowerCase() !== email.toLowerCase()}
          onClick={() => void remove()}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Deleting…' : 'Delete my account and all my data'}
        </Button>
      </CardContent>
    </Card>
  );
}
