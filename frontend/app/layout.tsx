import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RiskOps — Cyber Risk Dashboard',
  description:
    'Executive cyber risk dashboard for the RiskOps demo. Portfolio loss exposure, asset risk, vulnerabilities, scenarios and budget optimization.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='10' y='10' width='80' height='80' rx='18' fill='%230d1a31' stroke='%231f7dff' stroke-width='4'/><circle cx='50' cy='50' r='14' fill='%2322d3ee'/><path d='M50 38 L60 60 L50 54 L40 60 Z' fill='%230d1a31' stroke='%2322d3ee' stroke-width='3'/></svg>" />
      </head>
      <body className="m-0 p-0 min-h-screen bg-risk-bg-primary text-risk-text-primary">
        {children}
      </body>
    </html>
  );
}
