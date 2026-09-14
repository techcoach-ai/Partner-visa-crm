import seed from '@/partner-visa-checklist-seed.json';

/**
 * Static visa metadata read from the seed file. This is the same content that
 * seed.sql loads into the database; the JSON is the app's source for the
 * narrative bits (disclaimer text, key rules, fee) that aren't stored as rows.
 */

export interface VisaMeta {
  subclass: string;
  name: string;
  onshore_alternative: string;
  relationship_basis: string;
  application_fee_aud: number;
  fee_note: string;
  lodgement: string;
  key_rules: string[];
  disclaimer: string;
}

export const VISA: VisaMeta = seed.visa;

/** Single source for the disclaimer, so the footer and dashboard cannot drift. */
export const DISCLAIMER = VISA.disclaimer;

/** Bumped only when the disclaimer wording changes; recorded at signup. */
export const DISCLAIMER_VERSION = '2026-09-13';

export const FEE_AUD_FORMATTED = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
}).format(VISA.application_fee_aud);
