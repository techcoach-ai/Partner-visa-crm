/**
 * End-to-end encryption for uploaded documents.
 *
 * Runs only in the browser. The passphrase and the key derived from it are
 * never sent to the server, never persisted, and never leave this module in
 * usable form — the key is derived as non-extractable, so even code holding a
 * reference to it cannot export the raw bytes.
 *
 * The salt is public. It lives in user_crypto so the same passphrase derives
 * the same key on another device; on its own it reveals nothing.
 */

/** Deliberately high: this is the only thing standing between a leaked salt and an offline guess. */
export const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM standard nonce length
const KEY_BITS = 256;

/** Encrypted at setup and decrypted at unlock to tell a wrong passphrase from a corrupt file. */
const VERIFIER_PLAINTEXT = 'partner-visa-crm/verifier/v1';

export interface CryptoEnvelope {
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
}

export interface UserCryptoRecord {
  salt: string;
  iterations: number;
  verifier_iv: string;
  verifier_ct: string;
}

function subtle(): SubtleCrypto {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error(
      'Web Crypto is unavailable. Document encryption needs a secure context (HTTPS or localhost).',
    );
  }
  return window.crypto.subtle;
}

// ── base64 ────────────────────────────────────────────────────────────────────
// Chunked: String.fromCharCode(...bytes) overflows the call stack on anything
// more than a few hundred KB, which every real document exceeds.

export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // apply() rather than spread: the tsconfig target is ES5, and spreading a
    // typed array needs downlevelIteration.
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── key derivation ────────────────────────────────────────────────────────────

export function randomSalt(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * Derives the AES-GCM key. `extractable` is false, so the raw key material
 * cannot be read back out — it can only be used to encrypt and decrypt.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return subtle().deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

// ── encrypt / decrypt ─────────────────────────────────────────────────────────

export async function encryptBytes(
  key: CryptoKey,
  bytes: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    bytes as BufferSource,
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/**
 * Throws if the key is wrong or the data was tampered with — AES-GCM verifies
 * its authentication tag, so there is no "decrypts to garbage" case.
 */
export async function decryptBytes(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plaintext);
}

// ── verifier ──────────────────────────────────────────────────────────────────

export async function makeVerifier(key: CryptoKey): Promise<CryptoEnvelope> {
  const { iv, ciphertext } = await encryptBytes(
    key,
    new TextEncoder().encode(VERIFIER_PLAINTEXT),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/** True when the key derived from the entered passphrase is the right one. */
export async function checkVerifier(
  key: CryptoKey,
  envelope: CryptoEnvelope,
): Promise<boolean> {
  try {
    const plaintext = await decryptBytes(
      key,
      fromBase64(envelope.iv),
      fromBase64(envelope.ciphertext),
    );
    return new TextDecoder().decode(plaintext) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}
