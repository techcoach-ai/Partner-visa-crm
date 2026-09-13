import Link from 'next/link';
import { requireUser } from '@/lib/queries';
import { DisclaimerFooter } from '@/components/disclaimer';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/checklist', label: 'Checklist' },
  { href: '/assistant', label: 'Assistant' },
  { href: '/drafter', label: 'Statements' },
  { href: '/settings', label: 'Settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Partner Visa CRM
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <DisclaimerFooter />
    </div>
  );
}
