import type { Metadata } from 'next';
import { requireApplication } from '@/lib/queries';
import { StatementDrafter } from './statement-drafter';

export const metadata: Metadata = { title: 'Statements — Partner Visa CRM' };

export default async function DrafterPage() {
  const application = await requireApplication();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statement drafter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turns your relationship history into first drafts of both personal statements —
          one from {application.applicant_name ?? 'the applicant'}, one from{' '}
          {application.sponsor_name ?? 'the sponsor'}. They are drafts. Edit them until they
          sound like you, because they have to be true.
        </p>
      </div>
      <StatementDrafter />
    </div>
  );
}
