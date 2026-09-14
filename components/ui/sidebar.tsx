'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_ICON = '3.5rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

interface SidebarContextValue {
  /** Desktop rail expanded/collapsed. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Mobile drawer. */
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.');
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  className,
  children,
}: {
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, setOpenState] = React.useState(defaultOpen);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    // Persist so the rail doesn't reset on every navigation.
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile: isMobile === true,
      toggleSidebar,
    }),
    [open, setOpen, openMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            } as React.CSSProperties
          }
          className={cn('flex min-h-screen w-full', className)}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { isMobile, openMobile, setOpenMobile, open } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" hideClose className="w-[--sidebar-width] p-0">
          {/* Radix requires an accessible title on every dialog. */}
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      data-state={open ? 'expanded' : 'collapsed'}
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r bg-muted/30 transition-[width] duration-200 ease-linear md:flex md:flex-col',
        open ? 'w-[--sidebar-width]' : 'w-[--sidebar-width-icon]',
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col gap-2 p-3', className)}>{children}</div>;
}

export function SidebarContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2', className)}>
      {children}
    </div>
  );
}

export function SidebarFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
}

export function SidebarMenu({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn('flex w-full flex-col gap-1', className)}>{children}</ul>;
}

export function SidebarMenuItem({ children }: { children: React.ReactNode }) {
  return <li className="relative">{children}</li>;
}

/**
 * A nav row. When the rail is collapsed the label is hidden and surfaced as a
 * tooltip instead, so the icon strip stays usable.
 */
export function SidebarMenuButton({
  isActive = false,
  tooltip,
  className,
  children,
  asChild,
  ...props
}: React.ComponentProps<'button'> & {
  isActive?: boolean;
  tooltip?: string;
  asChild?: boolean;
}) {
  const { open, isMobile } = useSidebar();
  const Comp = asChild ? Slot : 'button';

  const button = (
    <Comp
      data-active={isActive}
      className={cn(
        'flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-sm outline-none transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground',
        !open && !isMobile && 'justify-center px-0',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );

  if (open || isMobile || !tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar, open, isMobile } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', className)}
      onClick={toggleSidebar}
      aria-label={isMobile ? 'Open navigation' : open ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
}

export function SidebarInset({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex min-w-0 flex-1 flex-col', className)}>{children}</div>;
}
