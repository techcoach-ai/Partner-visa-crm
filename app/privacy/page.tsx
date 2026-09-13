import Link from 'next/link';
import type { Metadata } from 'next';
import { DisclaimerFooter } from '@/components/disclaimer';

export const metadata: Metadata = { title: 'Privacy Policy — Partner Visa CRM' };

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Back
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This service handles sensitive personal information. This page sets out exactly what
          is stored, where, and who can reach it.
        </p>

        <div className="mt-8 max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">What is collected</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Your email address and password (the password is hashed by Supabase Auth; it is never visible to us).</li>
              <li>The date and time you accepted the &ldquo;not migration advice&rdquo; disclaimer.</li>
              <li>Application details you enter: applicant and sponsor names, target lodgement date.</li>
              <li>Checklist statuses and any notes you write.</li>
              <li>Documents you upload, which for this visa commonly include identity documents, financial records, and photographs of you and your partner.</li>
              <li>Messages you send to the assistant and text you give the statement drafter.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Sensitive information</h2>
            <p className="mt-2 text-muted-foreground">
              Partner visa evidence is sensitive information under the{' '}
              <em>Privacy Act 1988</em> (Cth) — it concerns your relationship, your finances
              and your household. It is collected only to help you assemble your own
              application, and it is used for nothing else. It is never sold, never used for
              advertising, and never used to train any model.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Where it is stored, and who can see it</h2>
            <p className="mt-2 text-muted-foreground">
              Data is held in Supabase (Postgres and Storage) and the application runs on
              Vercel. Documents live in a private storage bucket with no public URLs; files
              are served only through short-lived signed links generated for you after you
              authenticate.
            </p>
            <p className="mt-2 text-muted-foreground">
              Every table enforces row-level security keyed to your user ID, and the storage
              bucket enforces the same rule on the file path. One account cannot read
              another&apos;s records or documents. This is enforced by the database itself, not
              only by the application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Automated processing</h2>
            <p className="mt-2 text-muted-foreground">
              When you request a document review, that document is sent to the Anthropic API
              for analysis, and the resulting verdict and commentary are stored against it.
              The assistant and statement drafter send the text you provide, plus your
              checklist context, to the same API. Requests are made server-side; the API key
              is never exposed to your browser. Anthropic does not use API inputs to train its
              models. Do not upload anything you are not willing to have processed this way —
              reviews are only ever run when you ask for one.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Retention and deletion</h2>
            <p className="mt-2 text-muted-foreground">
              Your data is kept while your account exists. Deleting your account from Settings
              removes your uploaded files from storage and deletes your application, checklist,
              documents and assistant history, then deletes the account itself. This is
              immediate and cannot be undone. Backups held by our infrastructure providers may
              persist for a short period under their own retention schedules.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Your rights</h2>
            <p className="mt-2 text-muted-foreground">
              You can access and correct your information directly in the app at any time, and
              delete all of it from Settings. If you have a concern about how your information
              has been handled, you may also complain to the Office of the Australian
              Information Commissioner.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Cookies</h2>
            <p className="mt-2 text-muted-foreground">
              Only a session cookie used to keep you signed in. No advertising or analytics
              cookies are set.
            </p>
          </section>
        </div>
      </main>
      <DisclaimerFooter />
    </div>
  );
}
