import Link from 'next/link';
import type { Metadata } from 'next';
import { requireApplication, getChecklistEntries, groupByCategory } from '@/lib/queries';
import { computeReadiness } from '@/lib/readiness';
import { DONE_STATUSES } from '@/lib/types';
import { ReadinessGate } from '@/components/readiness-gate';
import { PillarGauges, AdminCategorySummary } from '@/components/pillar-gauges';
import { DisclaimerBanner } from '@/components/disclaimer';
import { GapAnalysis } from './gap-analysis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VISA, FEE_AUD_FORMATTED } from '@/lib/visa-data';

export const metadata: Metadata = { title: 'Dashboard — Partner Visa CRM' };

export default async function DashboardPage() {
  const application = await requireApplication();
  const entries = await getChecklistEntries(application.id);
  const readiness = computeReadiness(entries);

  const adminGroups = groupByCategory(entries)
    .filter((g) => g.category.pillar === null)
    .map((g) => ({
      name: g.category.name,
      total: g.entries.length,
      done: g.entries.filter((e) => DONE_STATUSES.includes(e.status)).length,
    }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {application.applicant_name} &amp; {application.sponsor_name} · Subclass{' '}
            {application.subclass}
            {application.target_lodge_date
              ? ` · Target lodgement ${new Date(application.target_lodge_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/checklist">Open checklist</Link>
        </Button>
      </div>

      <ReadinessGate readiness={readiness} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">The four evidence pillars</h2>
        <PillarGauges pillars={readiness.pillars} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCategorySummary groups={adminGroups} />
        <GapAnalysis />
      </div>

      <Card className="border-amber-500/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cost and timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Application charge{' '}
            <strong className="text-foreground">{FEE_AUD_FORMATTED}</strong> — non-refundable
            even if the application is refused or withdrawn. {VISA.fee_note}
          </p>
          <p>{VISA.lodgement}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rules worth keeping in view</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {VISA.key_rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <DisclaimerBanner />
    </div>
  );
}
