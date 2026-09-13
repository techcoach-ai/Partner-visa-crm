import { STATUS_LABELS, VERDICT_LABELS, type AiVerdict, type ItemStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT: Record<ItemStatus, 'default' | 'secondary' | 'outline' | 'success' | 'warning'> = {
  not_started: 'outline',
  in_progress: 'warning',
  uploaded: 'secondary',
  verified: 'success',
  not_applicable: 'outline',
};

export function StatusPill({ status }: { status: ItemStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}

const VERDICT_VARIANT: Record<AiVerdict, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  pending: 'outline',
  satisfies: 'success',
  partial: 'warning',
  insufficient: 'destructive',
  error: 'outline',
};

export function VerdictPill({ verdict }: { verdict: AiVerdict }) {
  return <Badge variant={VERDICT_VARIANT[verdict]}>{VERDICT_LABELS[verdict]}</Badge>;
}
