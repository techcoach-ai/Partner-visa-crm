import { cookies } from 'next/headers';
import { requireUser, getApplication } from '@/lib/queries';
import { DisclaimerFooter } from '@/components/disclaimer';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { VISA } from '@/lib/visa-data';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const application = await getApplication();

  // Read the persisted rail state on the server so the sidebar renders at the
  // right width on first paint instead of snapping after hydration.
  const defaultOpen = cookies().get('sidebar_state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar subclass={application?.subclass ?? VISA.subclass} />

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">
            Subclass {application?.subclass ?? VISA.subclass} — offshore, de facto
          </span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

        <DisclaimerFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
