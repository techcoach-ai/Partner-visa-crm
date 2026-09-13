import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getApplication, requireUser } from '@/lib/queries';
import { OnboardingForm } from './onboarding-form';
import { DisclaimerFooter } from '@/components/disclaimer';
import { VISA } from '@/lib/visa-data';

export const metadata: Metadata = { title: 'Get started — Partner Visa CRM' };

export default async function OnboardingPage() {
  await requireUser();
  const existing = await getApplication();
  if (existing) redirect('/dashboard');

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <p className="text-sm font-medium text-muted-foreground">
          Subclass {VISA.subclass} — onshore, de facto
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Set up your application</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This creates your checklist — 42 requirements across 12 categories. You can change
          any of this later.
        </p>
        <OnboardingForm />
      </main>
      <DisclaimerFooter />
    </div>
  );
}
