'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  ListChecks,
  MessageSquareText,
  PenLine,
  Settings,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/checklist', label: 'Checklist', icon: ListChecks },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/assistant', label: 'AI Assistant', icon: MessageSquareText },
  { href: '/drafter', label: 'Statement Drafter', icon: PenLine },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar({ subclass }: { subclass: string }) {
  const pathname = usePathname();
  const { open, isMobile, setOpenMobile } = useSidebar();
  const expanded = open || isMobile;

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/dashboard"
          onClick={() => setOpenMobile(false)}
          className={cn('flex items-center gap-2 rounded-md px-1 py-1', !expanded && 'justify-center px-0')}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
            PV
          </span>
          {expanded && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">Partner Visa CRM</span>
              <span className="truncate text-xs text-muted-foreground">
                Subclass {subclass} · offshore
              </span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <Separator />

      <SidebarContent>
        <SidebarMenu>
          {NAV.map(({ href, label, icon: Icon }) => {
            // Exact match, or a descendant route such as /checklist/[entryId].
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                  <Link href={href} onClick={() => setOpenMobile(false)}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {expanded && <span className="truncate">{label}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <Separator />

      <SidebarFooter>
        <form action="/auth/signout" method="post">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            title="Sign out"
            className={cn(
              'w-full justify-start text-muted-foreground',
              !expanded && 'justify-center px-0',
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {expanded ? 'Sign out' : <span className="sr-only">Sign out</span>}
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
