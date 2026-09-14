/**
 * Round-trip assertions for the document encryption layer.
 *
 * Runs the real lib/crypto.ts against Node's Web Crypto, which is the same
 * SubtleCrypto implementation the browser exposes.
 *
 * Run with: npm run verify:crypto
 */
import { webcrypto } from 'node:crypto';

// lib/crypto.ts reads window.crypto; give it one before importing.
(globalThis as unknown as { window: unknown }).window = {
  crypto: webcrypto,
} as unknown as Window;
(globalThis as unknown as { btoa: typeof btoa }).btoa ??= (b: string) =>
  Buffer.from(b, 'binary').toString('base64');
(globalThis as unknown as { atob: typeof atob }).atob ??= (b: string) =>
  Buffer.from(b, 'base64').toString('binary');

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  PBKDF2_ITERATIONS,
  checkVerifier,
  decryptBytes,
  deriveKey,
  encryptBytes,
  fromBase64,
  makeVerifier,
  randomSalt,
  toBase64,
} = require('../lib/crypto') as typeof import('../lib/crypto');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

async function main() {
  check('iterations are at least 200,000', PBKDF2_ITERATIONS >= 200_000);

  const salt = randomSalt();
  check('salt is 16 bytes', salt.length === 16);

  const key = await deriveKey('correct horse battery staple', salt);

  // The key must not be exportable, or "never leaves the browser" is not true.
  let extractable = true;
  try {
    await webcrypto.subtle.exportKey('raw', key as unknown as CryptoKey);
  } catch {
    extractable = false;
  }
  check('derived key is non-extractable', !extractable);

  // Round trip, including a size that crosses the base64 chunk boundary.
  // getRandomValues caps at 64 KB per call, so fill in chunks. (The library
  // itself only ever asks for 16-byte salts and 12-byte IVs.)
  const payload = new Uint8Array(200_000);
  for (let i = 0; i < payload.length; i += 65_536) {
    webcrypto.getRandomValues(payload.subarray(i, Math.min(i + 65_536, payload.length)));
  }
  const { iv, ciphertext } = await encryptBytes(key, payload);
  check('iv is 12 bytes', iv.length === 12);
  check('ciphertext differs from plaintext', Buffer.compare(Buffer.from(ciphertext), Buffer.from(payload)) !== 0);
  check('ciphertext is plaintext + 16-byte GCM tag', ciphertext.length === payload.length + 16);

  const back = await decryptBytes(key, iv, ciphertext);
  check('decrypt returns the original bytes', Buffer.compare(Buffer.from(back), Buffer.from(payload)) === 0);

  // base64 must survive a payload larger than the 0x8000 chunk size.
  check('base64 round-trips a 200 KB payload',
    Buffer.compare(Buffer.from(fromBase64(toBase64(payload))), Buffer.from(payload)) === 0);

  // Wrong passphrase must fail, not decrypt to garbage.
  const wrongKey = await deriveKey('not the passphrase', salt);
  let wrongRejected = false;
  try {
    await decryptBytes(wrongKey, iv, ciphertext);
  } catch {
    wrongRejected = true;
  }
  check('wrong passphrase is rejected, not silently wrong', wrongRejected);

  // A different salt must derive a different key.
  const otherKey = await deriveKey('correct horse battery staple', randomSalt());
  let otherRejected = false;
  try {
    await decryptBytes(otherKey, iv, ciphertext);
  } catch {
    otherRejected = true;
  }
  check('same passphrase with a different salt cannot decrypt', otherRejected);

  // Tampered ciphertext must fail the authentication tag.
  const tampered = new Uint8Array(ciphertext);
  tampered[0] ^= 0xff;
  let tamperRejected = false;
  try {
    await decryptBytes(key, iv, tampered);
  } catch {
    tamperRejected = true;
  }
  check('tampered ciphertext fails the auth tag', tamperRejected);

  // Verifier: the unlock check.
  const verifier = await makeVerifier(key);
  check('verifier accepts the right key', await checkVerifier(key, verifier));
  check('verifier rejects the wrong key', !(await checkVerifier(wrongKey, verifier)));

  // Two encryptions of the same bytes must differ (random IV per file).
  const a = await encryptBytes(key, payload);
  const b = await encryptBytes(key, payload);
  check('a fresh IV is used per file',
    Buffer.compare(Buffer.from(a.iv), Buffer.from(b.iv)) !== 0 &&
    Buffer.compare(Buffer.from(a.ciphertext), Buffer.from(b.ciphertext)) !== 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
