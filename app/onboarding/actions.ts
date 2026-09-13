'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface OnboardingState {
  error?: string;
}

/**
 * Creates the user's application and instantiates their checklist.
 *
 * seed_application_items() is called through RPC rather than inserting the 42
 * rows from here: it runs in one statement inside the database, and its
 * ON CONFLICT DO NOTHING makes a double submit harmless.
 */
export async function createApplication(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const applicantName = String(formData.get('applicant_name') ?? '').trim();
  const sponsorName = String(formData.get('sponsor_name') ?? '').trim();
  const targetLodgeDate = String(formData.get('target_lodge_date') ?? '').trim();

  if (!applicantName || !sponsorName) {
    return { error: 'Both the applicant and sponsor name are needed.' };
  }

  // Don't create a second application if one already exists.
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing) redirect('/dashboard');

  const { data: application, error: insertError } = await supabase
    .from('applications')
    .insert({
      owner_id: user.id,
      applicant_name: applicantName,
      sponsor_name: sponsorName,
      target_lodge_date: targetLodgeDate || null,
    })
    .select('id')
    .single();

  if (insertError || !application) {
    return { error: insertError?.message ?? 'Could not create your application.' };
  }

  const { error: seedError } = await supabase.rpc('seed_application_items', {
    app_id: application.id,
  });

  if (seedError) {
    // The application exists but has no checklist — surface it rather than
    // dropping the user into an empty dashboard.
    return { error: `Application created but the checklist failed to seed: ${seedError.message}` };
  }

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
