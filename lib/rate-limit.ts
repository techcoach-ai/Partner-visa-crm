import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Per-user rate limiting, counted in the database.
 *
 * In-memory counters are useless here: serverless instances do not share
 * memory, so a caller spreading requests across cold starts bypasses them
 * entirely. consume_rate_limit() is SECURITY DEFINER and reads auth.uid() from
 * the session, so a caller cannot spend, inspect or reset anyone's quota —
 * including their own. The rate_limits table has RLS on and no policy at all.
 */

export const LIMITS = {
  /** Document review is the most expensive call: a whole file goes to Opus. */
  review: { limit: 20, windowSeconds: 3600 },
  /** Whole-application analysis. */
  readiness: { limit: 20, windowSeconds: 3600 },
  /** Conversational, so a higher ceiling, still bounded. */
  assistant: { limit: 60, windowSeconds: 3600 },
  /** Long output; a handful of real drafts per hour is generous. */
  drafter: { limit: 10, windowSeconds: 3600 },
  /** Guards the delete path against being hammered. */
  account_delete: { limit: 5, windowSeconds: 3600 },
} as const;

export type RateLimitedAction = keyof typeof LIMITS;

/**
 * Returns true when the call may proceed.
 *
 * Fails CLOSED: if the counter cannot be read or written, the request is
 * refused rather than waved through. An unavailable limiter must not become an
 * unlimited one.
 */
export async function consumeRateLimit(action: RateLimitedAction): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[action];
  const supabase = createClient();

  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) return false;
  return data === true;
}

/** Standard 429 body, including how long the window is. */
export function rateLimitMessage(action: RateLimitedAction): string {
  const { limit, windowSeconds } = LIMITS[action];
  const minutes = Math.round(windowSeconds / 60);
  return `Rate limit reached: ${limit} requests per ${minutes} minutes. Try again shortly.`;
}
