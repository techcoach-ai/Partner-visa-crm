/** Mirrors the enums and tables in schema.sql. */

export type ItemStatus =
  | 'not_started'
  | 'in_progress'
  | 'uploaded'
  | 'verified'
  | 'not_applicable';

export type AppliesTo = 'applicant' | 'sponsor' | 'couple';

export type AiVerdict =
  | 'pending'
  | 'satisfies'
  | 'partial'
  | 'insufficient'
  | 'error';

export type Pillar = 'financial' | 'household' | 'social' | 'commitment';

export const PILLARS: Pillar[] = ['financial', 'household', 'social', 'commitment'];

export const PILLAR_LABELS: Record<Pillar, string> = {
  financial: 'Financial',
  household: 'Household',
  social: 'Social',
  commitment: 'Commitment',
};

/**
 * Statuses that count as "done" for the readiness gate.
 * not_applicable counts as done by design — e.g. no children, or a police
 * check for a country the applicant never lived in long enough to need one.
 */
export const DONE_STATUSES: ItemStatus[] = ['uploaded', 'verified', 'not_applicable'];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  uploaded: 'Uploaded',
  verified: 'Verified',
  not_applicable: 'Not applicable',
};

export const VERDICT_LABELS: Record<AiVerdict, string> = {
  pending: 'Not reviewed',
  satisfies: 'Satisfies',
  partial: 'Partial',
  insufficient: 'Insufficient',
  error: 'Review failed',
};

export interface Application {
  id: string;
  owner_id: string;
  subclass: string;
  relationship_basis: string;
  applicant_name: string | null;
  sponsor_name: string | null;
  target_lodge_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistCategory {
  id: string;
  key: string;
  name: string;
  pillar: Pillar | null;
  description: string | null;
  sort_order: number;
}

export interface ChecklistItem {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  applies_to: AppliesTo;
  required: boolean;
  form_reference: string | null;
  guidance: string | null;
  sort_order: number;
}

export interface DocumentRow {
  id: string;
  application_item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_verdict: AiVerdict | null;
  ai_notes: string | null;
  uploaded_at: string;
  /** True when the stored object is AES-GCM ciphertext. */
  encrypted: boolean;
  /** base64 IV for that ciphertext; null only on pre-encryption rows. */
  iv: string | null;
  /**
   * base64 ciphertext of the real display filename. For encrypted rows,
   * file_name holds a random UUID and mime_type holds octet-stream, so this is
   * the only place the real name exists — and only the passphrase holder can
   * read it.
   */
  name_cipher: string | null;
  /** base64 IV for name_cipher. */
  name_iv: string | null;
}

export interface ApplicationItem {
  id: string;
  application_id: string;
  item_id: string;
  status: ItemStatus;
  notes: string | null;
  updated_at: string;
}

/** An application_item joined to its template item, category and documents. */
export interface ChecklistEntry extends ApplicationItem {
  checklist_item: ChecklistItem & { category: ChecklistCategory };
  documents: DocumentRow[];
}
