import type { Metadata } from 'next';
import { requireUser, getApplication } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteAccount } from './delete-account';

export const metadata: Metadata = { title: 'Settings — Partner Visa CRM' };

export default async function SettingsPage() {
  const user = await requireUser();
  const application = await getApplication();
  const supabase = createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('disclaimer_accepted_at, disclaimer_version')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span>{user.email}</span>
          </div>
          {application && (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Applicant</span>
                <span>{application.applicant_name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Sponsor</span>
                <span>{application.sponsor_name}</span>
              </div>
            </>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Disclaimer accepted</span>
            <span>
              {profile?.disclaimer_accepted_at
                ? new Date(profile.disclaimer_accepted_at).toLocaleString('en-AU')
                : 'Not recorded'}
              {profile?.disclaimer_version ? ` (v${profile.disclaimer_version})` : ''}
            </span>
          </div>
        </CardContent>
      </Card>

      <DeleteAccount email={user.email ?? ''} />
    </div>
  );
}
