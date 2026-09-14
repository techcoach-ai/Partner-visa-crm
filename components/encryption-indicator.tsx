'use client';

import Link from 'next/link';
import { Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { useDocumentCrypto } from '@/components/crypto-provider';
import { cn } from '@/lib/utils';

/**
 * Persistent encryption state in the app header.
 *
 * Without this, the only way to discover that documents are encrypted — or that
 * they are currently locked — is to open a document screen and see which card
 * appears. The actionable states link to Settings → Security; the settled one
 * is deliberately quiet.
 */
export function EncryptionIndicator() {
  const { status } = useDocumentCrypto();

  if (status === 'loading') return null;

  if (status === 'unlocked') {
    return (
      <span
        className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"
        title="Documents are unlocked for this tab"
      >
        <LockOpen className="h-3 w-3" />
        Unlocked
      </span>
    );
  }

  const { label, icon: Icon, tone } =
    status === 'needs-setup'
      ? { label: 'Set up encryption', icon: ShieldAlert, tone: 'text-amber-700 dark:text-amber-400' }
      : status === 'unavailable'
        ? { label: 'Encryption unavailable', icon: ShieldAlert, tone: 'text-destructive' }
        : { label: 'Documents locked', icon: Lock, tone: 'text-amber-700 dark:text-amber-400' };

  return (
    <Link
      href="/settings"
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent',
        tone,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Link>
  );
}
