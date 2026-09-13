import Link from 'next/link';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { PillarProgress } from '@/lib/readiness';
import { PILLAR_LABELS } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const PILLAR_BLURB: Record<string, string> = {
  financial: 'That you share finances and financial commitments.',
  household: 'That you share a home and domestic life.',
  social: 'That others recognise you as a couple.',
  commitment: 'That the relationship is genuine, continuing and long-term.',
};

export function PillarGauges({ pillars }: { pillars: PillarProgress[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {pillars.map((p) => (
        <Card key={p.pillar}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{PILLAR_LABELS[p.pillar]}</CardTitle>
              {p.passes ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <CircleAlert className="h-4 w-4 text-amber-600" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Progress
              value={p.percent}
              indicatorClassName={p.passes ? 'bg-emerald-600' : 'bg-amber-500'}
            />
            <p className="mt-2 text-sm">
              <span className="font-medium">
                {p.done}/{p.total}
              </span>{' '}
              <span className="text-muted-foreground">documented</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.verified > 0
                ? `${p.verified} verified`
                : 'No verified item yet — this blocks the gate'}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {PILLAR_BLURB[p.pillar]}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminCategorySummary({
  groups,
}: {
  groups: { name: string; done: number; total: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Everything else</CardTitle>
        <p className="text-sm text-muted-foreground">
          Eligibility, identity, statements, sponsorship, health, character and lodgement.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="flex items-center justify-between text-sm">
              <Link href="/checklist" className="hover:underline">
                {g.name}
              </Link>
              <span className="text-muted-foreground">
                {g.done}/{g.total}
              </span>
            </div>
            <Progress
              value={g.total === 0 ? 0 : Math.round((g.done / g.total) * 100)}
              className="mt-1.5 h-1.5"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
