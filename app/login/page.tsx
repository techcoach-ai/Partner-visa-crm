import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { DisclaimerFooter } from '@/components/disclaimer';

export const metadata: Metadata = { title: 'Log in — Partner Visa CRM' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Back
        </Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Log in</h1>
        {/* useSearchParams() reads the ?redirect= param, so this subtree
            must be able to bail out of prerendering. */}
        <Suspense fallback={<div className="mt-8 h-64" />}>
          <LoginForm />
        </Suspense>
      </main>
      <DisclaimerFooter />
    </div>
  );
}
