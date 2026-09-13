'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DISCLAIMER, DISCLAIMER_VERSION } from '@/lib/visa-data';

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!accepted) {
      setError('You need to accept the disclaimer before creating an account.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Read by the handle_new_user trigger, which stamps the acceptance
        // time server-side with now(). The client asserts acceptance; it does
        // not get to choose the timestamp.
        data: {
          disclaimer_accepted: 'true',
          disclaimer_version: DISCLAIMER_VERSION,
        },
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // With email confirmation on, there is no session yet.
    if (!data.session) {
      setNotice('Check your email for a confirmation link to finish signing up.');
      return;
    }

    router.push('/onboarding');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <div className="rounded-md border bg-muted/40 p-4">
        <div className="flex gap-3">
          <input
            id="disclaimer"
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-input"
          />
          <Label htmlFor="disclaimer" className="text-xs font-normal leading-relaxed">
            <span className="font-medium">
              I understand this tool organises documents and is not migration advice.
            </span>{' '}
            {DISCLAIMER} I have read the{' '}
            <Link href="/terms" target="_blank" className="underline underline-offset-4">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading || !accepted}>
        {loading ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
