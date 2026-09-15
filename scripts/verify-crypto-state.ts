/**
 * Assertions for the document-encryption state machine.
 *
 * The bug this guards against: a failed read of user_crypto was classified as
 * 'locked' while the record stayed null, so a first-time user was shown an
 * unlock form that could never succeed — unlocking needs the salt from the very
 * record that failed to load.
 *
 * Run with: npm run verify:crypto-state
 */
import {
  classifyCryptoState,
  isCompleteRecord,
  looksLikeMissingTable,
  looksLikeStaleSchemaCache,
  type CryptoFacts,
} from '../lib/crypto-state';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const COMPLETE = { salt: 'c2FsdA==', iterations: 250_000, verifier_iv: 'aXY=', verifier_ct: 'Y3Q=' };

/** Defaults represent a loaded, healthy, Web-Crypto-capable browser. */
function facts(over: Partial<CryptoFacts> = {}): CryptoFacts {
  return {
    loaded: true,
    cryptoAvailable: true,
    loadFailed: false,
    record: null,
    hasKey: false,
    ...over,
  };
}

// ── The reported bug ─────────────────────────────────────────────────────────
check(
  'FRESH ACCOUNT, no user_crypto row -> needs-setup (not locked)',
  classifyCryptoState(facts({ record: null })) === 'needs-setup',
);
check(
  'load failure -> error, never locked',
  classifyCryptoState(facts({ loadFailed: true })) === 'error',
);
check(
  'load failure with no record is NOT needs-setup either (would invite a second passphrase)',
  classifyCryptoState(facts({ loadFailed: true, record: null })) !== 'needs-setup',
);

// ── Core transitions ─────────────────────────────────────────────────────────
check('complete record, no key -> locked',
  classifyCryptoState(facts({ record: COMPLETE })) === 'locked');
check('complete record, key held -> unlocked',
  classifyCryptoState(facts({ record: COMPLETE, hasKey: true })) === 'unlocked');
check('not loaded yet -> loading',
  classifyCryptoState(facts({ loaded: false })) === 'loading');
check('no Web Crypto -> unavailable, whatever else is true',
  classifyCryptoState(facts({ cryptoAvailable: false, record: COMPLETE, hasKey: true })) === 'unavailable');

// ── Partial rows must never offer an unlock form ─────────────────────────────
const partials: Array<[string, Record<string, unknown>]> = [
  ['salt missing', { ...COMPLETE, salt: undefined }],
  ['salt empty', { ...COMPLETE, salt: '' }],
  ['salt whitespace', { ...COMPLETE, salt: '   ' }],
  ['verifier_iv missing', { ...COMPLETE, verifier_iv: undefined }],
  ['verifier_ct missing', { ...COMPLETE, verifier_ct: undefined }],
  ['verifier_ct empty', { ...COMPLETE, verifier_ct: '' }],
  ['iterations zero', { ...COMPLETE, iterations: 0 }],
  ['iterations missing', { ...COMPLETE, iterations: undefined }],
];
for (const [label, record] of partials) {
  check(
    `partial row (${label}) -> needs-setup`,
    classifyCryptoState(facts({ record })) === 'needs-setup',
  );
}

// ── The invariant that makes the bug impossible ──────────────────────────────
// 'locked' may only be produced when a complete record is present.
let lockedWithoutRecord = false;
for (const loaded of [true, false]) {
  for (const loadFailed of [true, false]) {
    for (const hasKey of [true, false]) {
      for (const record of [null, {}, { salt: 'x' }, COMPLETE]) {
        const status = classifyCryptoState(
          facts({ loaded, loadFailed, hasKey, record: record as never }),
        );
        if (status === 'locked' && !isCompleteRecord(record as never)) {
          lockedWithoutRecord = true;
        }
      }
    }
  }
}
check("INVARIANT: 'locked' is unreachable without a complete record", !lockedWithoutRecord);

// ── Missing-table detection, so the message is actionable ────────────────────
check('undefined_table detected', looksLikeMissingTable({ code: '42P01', message: null }));
// A schema-cache miss is deliberately NOT a missing table: the table exists and
// re-running the migration would change nothing.
check('PostgREST schema-cache miss is routed to the cache case, not the migration case',
  looksLikeStaleSchemaCache({ code: 'PGRST205', message: "Could not find the table 'public.user_crypto'" }) &&
  !looksLikeMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.user_crypto'" }));
check('message-only detection works',
  looksLikeMissingTable({ code: null, message: 'relation "user_crypto" does not exist' }));
check('an ordinary error is not mistaken for a missing table',
  !looksLikeMissingTable({ code: '500', message: 'network timeout' }));
check('null error is not a missing table', !looksLikeMissingTable(null));

// ── Stale cache vs genuinely missing: opposite remedies, must not be confused ─
const staleCache = { code: 'PGRST205', message: "Could not find the table 'public.user_crypto' in the schema cache" };
check('PGRST205 is a stale cache', looksLikeStaleSchemaCache(staleCache));
check('PGRST205 is NOT reported as a missing table', !looksLikeMissingTable(staleCache));
const reallyMissing = { code: '42P01', message: 'relation "user_crypto" does not exist' };
check('42P01 is a missing table', looksLikeMissingTable(reallyMissing));
check('42P01 is NOT reported as a stale cache', !looksLikeStaleSchemaCache(reallyMissing));
check('a permission error is neither',
  !looksLikeMissingTable({ code: '42501', message: 'permission denied for table user_crypto' }) &&
  !looksLikeStaleSchemaCache({ code: '42501', message: 'permission denied for table user_crypto' }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
