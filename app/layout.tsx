import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Partner Visa CRM — Australian 309/100',
  description:
    'Organise the documents for an Australian offshore de facto partner visa (subclass 309/100). Organises documents; not migration advice.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
