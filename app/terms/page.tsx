import Link from 'next/link';
import type { Metadata } from 'next';
import { DisclaimerFooter } from '@/components/disclaimer';
import { DISCLAIMER } from '@/lib/visa-data';

export const metadata: Metadata = { title: 'Terms of Use — Partner Visa CRM' };

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Back
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Terms of Use</h1>

        <div className="prose prose-sm mt-8 max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. What this service is</h2>
            <p className="mt-2 text-muted-foreground">
              Partner Visa CRM is a document organiser for Australian partner visa
              applications (subclass 309/100). It provides a checklist derived from publicly
              available guidance, stores documents you upload against those checklist items,
              and uses automated tools to comment on them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. This is not migration advice</h2>
            <p className="mt-2 text-muted-foreground">{DISCLAIMER}</p>
            <p className="mt-2 text-muted-foreground">
              Under the <em>Migration Act 1958</em> (Cth), immigration assistance in Australia
              may generally only be given by a registered migration agent or an Australian
              legal practitioner. Nothing in this service is immigration assistance, a legal
              opinion, or a representation that your application will succeed. No
              client relationship of any kind is created by using it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Automated review has limits</h2>
            <p className="mt-2 text-muted-foreground">
              Document review, readiness analysis, the assistant and the statement drafter are
              produced by a large language model. They can be wrong, incomplete, or out of
              date. The &ldquo;decision-ready&rdquo; indicator reflects only whether you have
              completed the items in this tool — it is not an assessment by the Department of
              Home Affairs and does not predict any outcome. Always verify against{' '}
              <a
                href="https://immi.homeaffairs.gov.au"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                immi.homeaffairs.gov.au
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Drafted statements are yours</h2>
            <p className="mt-2 text-muted-foreground">
              Statements produced by the drafter are first drafts built from information you
              supply. They are never submitted anywhere on your behalf. You are responsible
              for reviewing every statement for accuracy before use. Submitting false or
              misleading information to the Department is a serious matter with consequences
              for your application and beyond.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Your account and your content</h2>
            <p className="mt-2 text-muted-foreground">
              You are responsible for keeping your login credentials secure and for the
              accuracy and lawfulness of what you upload. You retain ownership of your
              documents. You may delete your account and its data at any time from Settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Fees quoted here are indicative</h2>
            <p className="mt-2 text-muted-foreground">
              The visa application charge shown in this tool is reproduced from public
              guidance and may be out of date. Confirm the current charge with the Department
              before paying. Fees paid to the Department are not refundable if an application
              is refused or withdrawn.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Availability and liability</h2>
            <p className="mt-2 text-muted-foreground">
              The service is provided on an &ldquo;as is&rdquo; basis without warranties of
              any kind. To the extent permitted by law, we are not liable for any loss arising
              from your use of it, including any visa application that is delayed, refused or
              withdrawn. Nothing here excludes rights you have under the Australian Consumer
              Law that cannot lawfully be excluded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Changes</h2>
            <p className="mt-2 text-muted-foreground">
              These terms may change. Material changes to the disclaimer will require renewed
              acceptance.
            </p>
          </section>
        </div>
      </main>
      <DisclaimerFooter />
    </div>
  );
}
