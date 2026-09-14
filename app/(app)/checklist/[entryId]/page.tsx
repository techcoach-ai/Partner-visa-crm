import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { requireApplication, getChecklistEntries } from '@/lib/queries';
import { PILLAR_LABELS, type Pillar } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ItemDetail } from './item-detail';
import { CryptoGate } from '@/components/crypto-gate';

export const metadata: Metadata = { title: 'Requirement — Partner Visa CRM' };

export default async function ItemPage({ params }: { params: { entryId: string } }) {
  const application = await requireApplication();
  const entries = await getChecklistEntries(application.id);
  const entry = entries.find((e) => e.id === params.entryId);

  if (!entry) notFound();

  const { checklist_item: item } = entry;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/checklist"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Checklist
      </Link>

      <div>
        <p className="text-sm text-muted-foreground">{item.category.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{item.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.required ? (
            <Badge variant="outline">Required</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Optional
            </Badge>
          )}
          <Badge variant="secondary" className="capitalize">
            {item.applies_to}
          </Badge>
          {item.form_reference && <Badge>{item.form_reference}</Badge>}
          {item.category.pillar && (
            <Badge variant="secondary">
              {PILLAR_LABELS[item.category.pillar as Pillar]} pillar
            </Badge>
          )}
        </div>
      </div>

      {item.guidance && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What&apos;s needed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.guidance}</p>
            {item.description && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <CryptoGate>
        <ItemDetail
          entryId={entry.id}
          applicationId={application.id}
          itemId={entry.item_id}
          status={entry.status}
          notes={entry.notes}
          documents={entry.documents}
        />
      </CryptoGate>
    </div>
  );
}
