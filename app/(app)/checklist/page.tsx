import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, Paperclip } from 'lucide-react';
import { requireApplication, getChecklistEntries, groupByCategory } from '@/lib/queries';
import { DONE_STATUSES, PILLAR_LABELS, type Pillar } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/status-pill';

export const metadata: Metadata = { title: 'Checklist — Partner Visa CRM' };

export default async function ChecklistPage() {
  const application = await requireApplication();
  const entries = await getChecklistEntries(application.id);
  const groups = groupByCategory(entries);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Checklist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.filter((e) => DONE_STATUSES.includes(e.status)).length} of {entries.length}{' '}
          items complete. Items marked <em>not applicable</em> count as done.
        </p>
      </div>

      {groups.map(({ category, entries: items }) => {
        const done = items.filter((e) => DONE_STATUSES.includes(e.status)).length;
        return (
          <Card key={category.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{category.name}</CardTitle>
                  {category.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {category.pillar && (
                    <Badge variant="secondary">
                      {PILLAR_LABELS[category.pillar as Pillar]} pillar
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {done}/{items.length}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <ul className="divide-y border-t">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/checklist/${entry.id}`}
                      className="flex items-start gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{entry.checklist_item.title}</span>
                          {entry.checklist_item.required ? (
                            <Badge variant="outline" className="text-[10px]">
                              Required
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Optional
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {entry.checklist_item.applies_to}
                          </Badge>
                          {entry.checklist_item.form_reference && (
                            <Badge className="text-[10px]">
                              {entry.checklist_item.form_reference}
                            </Badge>
                          )}
                        </div>
                        {entry.checklist_item.guidance && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {entry.checklist_item.guidance}
                          </p>
                        )}
                        {entry.documents.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="h-3 w-3" />
                            {entry.documents.length} document
                            {entry.documents.length === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusPill status={entry.status} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
