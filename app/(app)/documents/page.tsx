import type { Metadata } from 'next';
import { requireApplication, getChecklistEntries } from '@/lib/queries';
import { DocumentLibrary, type LibraryRow } from './document-library';

export const metadata: Metadata = { title: 'Documents — Partner Visa CRM' };

export default async function DocumentsPage() {
  const application = await requireApplication();
  const entries = await getChecklistEntries(application.id);

  // Flatten every document across the checklist, newest first, keeping the
  // requirement each one was uploaded against.
  const rows: LibraryRow[] = entries
    .flatMap((entry) =>
      entry.documents.map((doc) => ({
        id: doc.id,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        sizeBytes: doc.size_bytes,
        verdict: doc.ai_verdict ?? 'pending',
        notes: doc.ai_notes,
        uploadedAt: doc.uploaded_at,
        entryId: entry.id,
        requirement: entry.checklist_item.title,
        categoryName: entry.checklist_item.category.name,
        pillar: entry.checklist_item.category.pillar,
      })),
    )
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every file you&apos;ve uploaded, and the requirement it was filed against.
        </p>
      </div>
      <DocumentLibrary rows={rows} />
    </div>
  );
}
