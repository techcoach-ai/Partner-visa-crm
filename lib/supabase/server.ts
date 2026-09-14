import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Authenticates as the signed-in user via the auth cookie, so every query it
 * makes is constrained by Row Level Security. This is the client to reach for
 * by default — RLS is the isolation boundary between tenants, and using the
 * user's own credentials is what keeps that boundary in force.
 *
 * Synchronous: `cookies()` is sync in Next.js 14. (It becomes async in 15, at
 * which point this and its callers need `await`.)
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled in middleware, so this is safe to
            // swallow — the refreshed cookie is written there instead.
          }
        },
      },
    },
  );
}
