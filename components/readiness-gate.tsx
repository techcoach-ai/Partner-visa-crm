import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Readiness } from '@/lib/readiness';
import { PILLAR_LABELS } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export function ReadinessGate({ readiness }: { readiness: Readiness }) {
  const {
    isDecisionReady,
    failingPillars,
    outstandingRequired,
    requiredDone,
    requiredTotal,
    percent,
  } = readiness;

  return (
    <Card
      className={
        isDecisionReady
          ? 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20'
          : 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20'
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {isDecisionReady ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div>
            <CardTitle className="text-lg">
              {isDecisionReady ? 'Decision-ready' : 'Not decision-ready'}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {isDecisionReady
                ? 'Every pillar has verified evidence and every required item is done. Check everything once more against immi.homeaffairs.gov.au before you lodge.'
                : 'Under the April 2026 approach the Department expects a complete application at lodgement. Follow-up requests are limited, and an incomplete application risks a faster refusal.'}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Required items</span>
            <span className="font-medium">
              {requiredDone} of {requiredTotal}
            </span>
          </div>
          <Progress
            value={requiredTotal === 0 ? 0 : Math.round((requiredDone / requiredTotal) * 100)}
            className="mt-2"
            indicatorClassName={isDecisionReady ? 'bg-emerald-600' : 'bg-amber-500'}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {percent}% of all {readiness.pillars.reduce((n, p) => n + p.total, 0) > 0 ? 'items' : 'items'} complete
          </p>
        </div>

        {!isDecisionReady && (
          <div className="space-y-2 text-sm">
            {failingPillars.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  Pillars with no verified evidence:
                </span>
                {failingPillars.map((p) => (
                  <Badge key={p} variant="warning">
                    {PILLAR_LABELS[p]}
                  </Badge>
                ))}
              </div>
            )}
            {outstandingRequired.length > 0 && (
              <p className="text-muted-foreground">
                <Link href="/checklist" className="font-medium text-foreground underline underline-offset-4">
                  {outstandingRequired.length} required{' '}
                  {outstandingRequired.length === 1 ? 'item' : 'items'}
                </Link>{' '}
                still to complete. Items marked <em>not applicable</em> count as done.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
