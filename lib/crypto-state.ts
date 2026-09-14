/**
 * The document-encryption state machine.
 *
 * Kept as a pure function, deliberately. This was previously decided inline in
 * five places inside the provider, and one of them — the load-error path — set
 * 'locked' while leaving the record null. That rendered an unlock form that
 * could never succeed, because unlocking needs the salt from that record.
 *
 * Deriving the status from facts makes the invariant structural: 'locked'
 * cannot be produced without a complete record, because that is the only branch
 * that returns it.
 */

export type CryptoStatus =
  | 'loading'
  | 'unavailable'
  | 'error'
  | 'needs-setup'
  | 'locked'
  | 'unlocked';

export interface UserCryptoRecord {
  salt: string;
  iterations: number;
  verifier_iv: string;
  verifier_ct: string;
}

export interface CryptoFacts {
  /** The initial load has finished (successfully or not). */
  loaded: boolean;
  /** Web Crypto is present — it needs a secure context. */
  cryptoAvailable: boolean;
  /** The load failed. A failure is never treated as "locked". */
  loadFailed: boolean;
  /** Whatever came back from user_crypto; null means no row. */
  record: Partial<UserCryptoRecord> | null;
  /** A derived key is held in memory for this tab. */
  hasKey: boolean;
}

/**
 * A record is usable only if every field needed to derive and verify the key is
 * present and non-empty. A partial row means setup never completed, so the user
 * must create a passphrase — not be asked to unlock with a salt that isn't there.
 */
export function isCompleteRecord(
  record: Partial<UserCryptoRecord> | null,
): record is UserCryptoRecord {
  if (!record) return false;
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return (
    nonEmpty(record.salt) &&
    nonEmpty(record.verifier_iv) &&
    nonEmpty(record.verifier_ct) &&
    typeof record.iterations === 'number' &&
    record.iterations > 0
  );
}

export function classifyCryptoState(facts: CryptoFacts): CryptoStatus {
  if (!facts.cryptoAvailable) return 'unavailable';
  if (!facts.loaded) return 'loading';

  // A failed load tells us nothing about whether setup has happened. Saying
  // "locked" would be a guess, and the wrong one strands a first-time user on a
  // form they cannot complete.
  if (facts.loadFailed) return 'error';

  if (!isCompleteRecord(facts.record)) return 'needs-setup';
  if (!facts.hasKey) return 'locked';
  return 'unlocked';
}

/**
 * True when a Postgres/PostgREST error means the table or column is missing
 * rather than something transient — almost always a migration that has not been
 * run. Worth separating, because the fix is a deployment step, not a retry.
 */
export function looksLikeMissingTable(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  if (!error) return false;
  // 42P01 undefined_table, 42703 undefined_column, PGRST20x schema-cache misses.
  const code = error.code ?? '';
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('schema cache')
  );
}
