import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components. Uses the anon key, which carries no
 * privileges of its own — every request is still constrained by RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
