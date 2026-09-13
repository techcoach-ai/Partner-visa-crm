import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { DISCLAIMER } from '@/lib/visa-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Both variants render the same text from the seed file, so the footer and the
 * dashboard can never drift apart.
 */

/** Persistent site footer. Present on every page, signed in or out. */
export function DisclaimerFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">
          This tool organises documents. It is not migration advice.
        </p>
        <p className="mt-1 max-w-3xl">{DISCLAIMER}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy
          </Link>
          <a
            href="https://immi.homeaffairs.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            immi.homeaffairs.gov.au
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Prominent variant for the dashboard. */
export function DisclaimerBanner() {
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Organises documents — not migration advice</AlertTitle>
      <AlertDescription>
        <p>{DISCLAIMER}</p>
      </AlertDescription>
    </Alert>
  );
}
