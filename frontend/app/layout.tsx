import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import AppShell from '@/components/AppShell';
import './globals.css';

/*
 * Typography: one family for the interface (Inter), one for machine
 * identifiers (IBM Plex Mono). Mono is reserved for CVE / asset codes so it
 * reads as data, not as decoration.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RiskOps — Cyber Risk Finance',
  description:
    'FinPay security operations: assets, vulnerabilities, financial risk and remediation.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='6' fill='%23111418'/><path d='M50 18l24 10v14c0 16-9 28-24 34-15-6-24-18-24-34V28z' fill='none' stroke='%239cb7ca' stroke-width='6' stroke-linejoin='round'/><path d='M39 51l8 8 15-16' fill='none' stroke='%239cb7ca' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/></svg>"
        />
      </head>
      <body className="m-0 min-h-screen p-0 font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
