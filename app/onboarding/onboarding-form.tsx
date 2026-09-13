'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createApplication, type OnboardingState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Creating your checklist…' : 'Create my checklist'}
    </Button>
  );
}

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction] = useFormState(createApplication, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="applicant_name">Applicant&apos;s full name</Label>
        <Input id="applicant_name" name="applicant_name" required autoComplete="off" />
        <p className="text-xs text-muted-foreground">The person applying for the visa.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sponsor_name">Sponsor&apos;s full name</Label>
        <Input id="sponsor_name" name="sponsor_name" required autoComplete="off" />
        <p className="text-xs text-muted-foreground">
          The Australian citizen, permanent resident or eligible NZ citizen sponsoring them.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_lodge_date">Target lodgement date (optional)</Label>
        <Input id="target_lodge_date" name="target_lodge_date" type="date" />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton />
    </form>
  );
}
