import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. BYPASSES Row Level Security entirely.
 *
 * Only for operations a user-scoped client genuinely cannot perform — today
 * that is deleting an auth user during account deletion. Never import this
 * into a Client Component, and never use it to read or write user data that a
 * user-scoped client could reach: RLS is the isolation boundary between
 * tenants, and this client stands outside it.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
