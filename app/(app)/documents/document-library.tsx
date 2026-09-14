'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { VerdictPill } from '@/components/status-pill';
import { PILLAR_LABELS, type AiVerdict, type Pillar } from '@/lib/types';

export interface LibraryRow {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  verdict: AiVerdict;
  notes: string | null;
  uploadedAt: string;
  entryId: string;
  requirement: string;
  categoryName: string;
  pillar: string | null;
}

function formatBytes(n: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentLibrary({ rows }: { rows: LibraryRow[] }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fileName.toLowerCase().includes(q) ||
        r.requirement.toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function open(documentId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/signed-url`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not open the file.');
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file.');
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No documents yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Files you upload against a checklist requirement will all show up here.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/checklist">Go to the checklist</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by file name, requirement or category…"
          className="pl-9"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} of {rows.length} {rows.length === 1 ? 'document' : 'documents'}
      </p>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {filtered.map((row) => (
              <li key={row.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.fileName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatBytes(row.sizeBytes)}
                      {row.mimeType ? ` · ${row.mimeType}` : ''} ·{' '}
                      {new Date(row.uploadedAt).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/checklist/${row.entryId}`}
                        className="text-xs underline underline-offset-4 hover:text-foreground"
                      >
                        {row.requirement}
                      </Link>
                      {row.pillar && (
                        <Badge variant="secondary" className="text-[10px]">
                          {PILLAR_LABELS[row.pillar as Pillar]}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <VerdictPill verdict={row.verdict} />
                    <Button size="sm" variant="ghost" onClick={() => void open(row.id)}>
                      <Download className="h-4 w-4" />
                      <span className="sr-only">Open {row.fileName}</span>
                    </Button>
                  </div>
                </div>
                {row.notes && (
                  <p className="rounded bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
                    {row.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
