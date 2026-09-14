import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, FileText, MessageSquareText, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DisclaimerFooter } from '@/components/disclaimer';
import { VISA, FEE_AUD_FORMATTED } from '@/lib/visa-data';

export default async function LandingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/dashboard');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="font-semibold">Partner Visa CRM</span>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Sign up</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">
            Subclass {VISA.subclass} — offshore, de facto
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Get your partner visa application decision-ready.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Turns the official requirements into a tracked checklist, keeps every document
            against the requirement it satisfies, and won&apos;t tell you you&apos;re ready
            until all four evidence pillars actually hold up.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Start your checklist</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: CheckCircle2,
              title: '42-point checklist',
              body: 'Every requirement across eligibility, identity, the four pillars, statements, sponsorship, health, character and lodgement.',
            },
            {
              icon: FileText,
              title: 'Document review',
              body: 'Upload evidence against a requirement and get an honest read on whether it actually supports it.',
            },
            {
              icon: ShieldCheck,
              title: 'Readiness gate',
              body: 'Not decision-ready until every pillar has verified evidence and every required item is done.',
            },
            {
              icon: MessageSquareText,
              title: 'Statement drafter',
              body: 'Turn your relationship timeline into first drafts of both personal statements. Always yours to edit.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-12 border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Before you start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The application charge is <strong className="text-foreground">{FEE_AUD_FORMATTED}</strong>{' '}
              and is non-refundable even if the application is refused. {VISA.fee_note}
            </p>
            <p>
              This tool organises and researches. It does not give migration advice, and
              nothing here is a substitute for checking immi.homeaffairs.gov.au or engaging
              a MARA-registered migration agent.
            </p>
          </CardContent>
        </Card>
      </main>

      <DisclaimerFooter />
    </div>
  );
}
