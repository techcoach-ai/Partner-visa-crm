/**
 * Upload constraints, shared by the browser, the server actions and the
 * database. Deliberately NOT server-only: the client needs these to give
 * immediate feedback.
 *
 * The browser check is a convenience, never the control. The same limits are
 * set on the bucket itself in schema.sql (file_size_limit, allowed_mime_types),
 * so Storage rejects an oversized or wrong-typed upload even when the request
 * comes straight from the API with no page involved.
 */
export const BUCKET = 'visa-documents';

/** Types the Anthropic API can review, and therefore the only ones worth storing. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** 20 MB. Mirrored by file_size_limit on the bucket. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export const ALLOWED_TYPES_LABEL = 'PDF, JPEG, PNG, GIF or WebP';

/**
 * Strips anything that could be meaningful to a path or a shell, so an upload
 * cannot escape its folder or smuggle separators into the object key.
 */
export function sanitiseFileName(name: string): string {
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 200);
}
