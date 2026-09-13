import Link from 'next/link';
import type { Metadata } from 'next';
import { SignupForm } from './signup-form';
import { DisclaimerFooter } from '@/components/disclaimer';

export const metadata: Metadata = { title: 'Sign up — Partner Visa CRM' };

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Back
        </Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your checklist and documents are private to you.
        </p>
        <SignupForm />
      </main>
      <DisclaimerFooter />
    </div>
  );
}
