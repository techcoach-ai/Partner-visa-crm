'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { setItemStatus, setItemNotes, deleteDocument, recordDocument } from '../actions';
import {
  ALLOWED_TYPES_LABEL,
  BUCKET,
  MAX_UPLOAD_BYTES,
  isAllowedMimeType,
  sanitiseFileName,
} from '@/lib/storage';
import {
  STATUS_LABELS,
  type AiVerdict,
  type DocumentRow,
  type ItemStatus,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { VerdictPill } from '@/components/status-pill';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUSES: ItemStatus[] = [
  'not_started',
  'in_progress',
  'uploaded',
  'verified',
  'not_applicable',
];

function formatBytes(n: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ItemDetail({
  entryId,
  applicationId,
  itemId,
  status,
  notes,
  documents,
}: {
  entryId: string;
  applicationId: string;
  itemId: string;
  status: ItemStatus;
  notes: string | null;
  documents: DocumentRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState(notes ?? '');
  const [noteSaved, setNoteSaved] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    const supabase = createClient();

    for (const file of Array.from(files)) {
      // Advisory only — the bucket enforces both limits itself, and the server
      // action re-checks before writing the row.
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`"${file.name}" is larger than 20 MB.`);
        continue;
      }
      if (!isAllowedMimeType(file.type)) {
        setError(`"${file.name}" is not a supported type. Use ${ALLOWED_TYPES_LABEL}.`);
        continue;
      }

      const path = `${applicationId}/${itemId}/${Date.now()}-${sanitiseFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(`Could not upload "${file.name}": ${uploadError.message}`);
        continue;
      }

      // The row is written server-side, where the path is verified against the
      // folder for this item. The browser never gets to choose where a
      // documents row points.
      const result = await recordDocument({
        entryId,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      if (result.error) {
        // Don't leave the object behind with no row pointing at it.
        await supabase.storage.from(BUCKET).remove([path]);
        setError(`Could not record "${file.name}": ${result.error}`);
        continue;
      }

      // Uploading moves an untouched item forward, but never overrides a
      // status the user set deliberately.
      if (status === 'not_started' || status === 'in_progress') {
        await setItemStatus(entryId, 'uploaded');
      }
    }

    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    router.refresh();
  }

  async function review(documentId: string) {
    setReviewing(documentId);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/review`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Review failed.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setReviewing(null);
    }
  }

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

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={status}
            onValueChange={(value) =>
              startTransition(async () => {
                const res = await setItemStatus(entryId, value as ItemStatus);
                if (res?.error) setError(res.error);
                router.refresh();
              })
            }
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The readiness gate needs at least one <strong>verified</strong> item in each
            pillar. <strong>Not applicable</strong> counts as done.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(e.dataTransfer.files);
            }}
            className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
          >
            <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm">
              Drag files here, or{' '}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="font-medium underline underline-offset-4"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ALLOWED_TYPES_LABEL} only. Up to 20 MB each.
            </p>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => void upload(e.target.files)}
            />
            {uploading && (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </p>
            )}
          </div>

          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {documents.map((doc) => (
                <li key={doc.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(doc.size_bytes)}
                        {doc.mime_type ? ` · ${doc.mime_type}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <VerdictPill verdict={(doc.ai_verdict ?? 'pending') as AiVerdict} />
                      <Button size="sm" variant="ghost" onClick={() => void open(doc.id)}>
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Open</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewing === doc.id}
                        onClick={() => void review(doc.id)}
                      >
                        {reviewing === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {reviewing === doc.id ? 'Reviewing…' : 'Review'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await deleteDocument(doc.id);
                            if (res?.error) setError(res.error);
                            router.refresh();
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                  {doc.ai_notes && (
                    <p className="rounded bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
                      {doc.ai_notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="notes" className="sr-only">
            Notes
          </Label>
          <Textarea
            id="notes"
            rows={4}
            value={noteDraft}
            placeholder="Anything you want to remember about this requirement."
            onChange={(e) => {
              setNoteDraft(e.target.value);
              setNoteSaved(false);
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const res = await setItemNotes(entryId, noteDraft);
                  if (res?.error) setError(res.error);
                  else setNoteSaved(true);
                })
              }
            >
              Save notes
            </Button>
            {noteSaved && <span className="text-xs text-muted-foreground">Saved.</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
