import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Model choice follows the brief: Opus for document and vision review, Sonnet
 * for the conversational surfaces.
 */
export const REVIEW_MODEL = 'claude-opus-5';
export const CHAT_MODEL = 'claude-sonnet-5';

export const BUCKET = 'visa-documents';

/** Media types the Anthropic API accepts as image blocks. */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/**
 * The API caps a request at 32 MB. Base64 inflates by roughly a third, so the
 * practical ceiling on the raw file is about 24 MB. Stay clear of the edge.
 */
export const MAX_REVIEW_FILE_BYTES = 20 * 1024 * 1024;

let client: Anthropic | null = null;

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Concatenated text of a response, ignoring thinking and other block types. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Parses a JSON object out of a model response.
 *
 * Returns null rather than throwing, so callers can record an explicit error
 * state instead of guessing at a result.
 */
export function parseJsonObject<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the outermost braces, in case the model wrapped the object
    // in prose despite being told not to.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

/** The standing constraint applied to every AI surface in this app. */
export const NOT_ADVICE_RULE =
  'You organise and comment on documents. You are not a migration agent and you ' +
  'must not give migration advice, predict the outcome of an application, or ' +
  'interpret the law. For anything authoritative, defer to ' +
  'immi.homeaffairs.gov.au and suggest a MARA-registered migration agent.';
