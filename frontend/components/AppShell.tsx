'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  CircleAlert,
  Database,
  Gauge,
  Layers,
  Shield,
  ShieldCheck,
  Sliders,
} from 'lucide-react';

import { api } from '@/lib';
import { cn } from '@/lib/format';

/*
 * Global chrome, rendered once in the root layout.
 *
 * Left rail carries navigation grouped by the operator's actual workflow
 * (what am I looking at → what exists → how bad → what to do). The top bar
 * carries the only status widget: a live probe of the metrics API. There is
 * no mock user, no fake environment chip — anything displayed is probed or
 * static truth.
 */

type NavGroup = {
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: ReactNode;
    exact?: boolean;
  }>;
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: <Gauge className="h-4 w-4" />, exact: true },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/assets', label: 'Assets', icon: <Database className="h-4 w-4" /> },
      { href: '/vulnerabilities', label: 'Vulnerabilities', icon: <Shield className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/scenarios', label: 'Risk scenarios', icon: <Layers className="h-4 w-4" /> },
      { href: '/optimizer', label: 'Budget optimizer', icon: <Sliders className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Operations',
    items: [{ href: '/remediation', label: 'Remediation', icon: <ShieldCheck className="h-4 w-4" /> }],
  },
];

type HealthPhase = 'probing' | 'ok' | 'down';

function ApiStatusPill() {
  const [phase, setPhase] = useState<HealthPhase>('probing');
  const [detail, setDetail] = useState<string>('probing…');

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const status = await api.health.get();
        if (!cancelled) {
          setPhase('ok');
          setDetail(`API ${status.version ?? 'online'}`);
        }
      } catch {
        if (!cancelled) {
          setPhase('down');
          setDetail('API offline');
        }
      }
    };
    void probe();
    const timer = setInterval(probe, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        phase === 'ok' && 'border-[color:var(--hairline)]',
        phase === 'down' && 'border-[rgba(248,113,113,0.3)]',
        phase === 'probing' && 'border-[color:var(--hairline)]',
      )}
      role="status"
      aria-live="polite"
    >
      {phase === 'down' ? (
        <CircleAlert className="h-3.5 w-3.5 text-[color:var(--severity-rose)]" />
      ) : (
        <Activity
          className={cn(
            'h-3.5 w-3.5',
            phase === 'ok' ? 'text-[color:var(--severity-emerald)]' : 'text-[color:var(--ink-muted)]',
          )}
        />
      )}
      <span
        className={cn(
          'tabular-nums',
          phase === 'ok' && 'text-[color:var(--ink-secondary)]',
          phase === 'down' && 'text-[color:var(--severity-rose)]',
          phase === 'probing' && 'text-[color:var(--ink-muted)]',
        )}
      >
        {detail}
      </span>
    </div>
  );
}

function NavLinks({ orientation }: { orientation: 'rail' | 'strip' }) {
  const pathname = usePathname();

  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div
          key={group.label}
          className={orientation === 'rail' ? 'mb-6' : 'flex items-center gap-1'}
        >
          {orientation === 'rail' && (
            <div className="mb-2 px-3 text-xs font-medium   text-[color:var(--ink-faint)]">
              {group.label}
            </div>
          )}
          <div
            className={cn(
              orientation === 'rail' ? 'space-y-0.5 px-2' : 'flex flex-nowrap gap-1 overflow-x-auto',
            )}
          >
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex shrink-0 items-center gap-2.5 rounded-md text-sm transition-colors',
                    orientation === 'rail' ? 'px-3 py-2' : 'px-3 py-1.5',
                    active
                      ? 'bg-[color:var(--surface-raised)] text-[color:var(--ink-primary)]'
                      : 'text-[color:var(--ink-secondary)] hover:bg-[color:var(--surface-raised)]/60 hover:text-[color:var(--ink-primary)]',
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-[color:var(--accent)]"
                    />
                  )}
                  <span
                    className={cn(
                      'shrink-0',
                      active ? 'text-[color:var(--accent)]' : 'text-[color:var(--ink-muted)]',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-slate-900 focus:p-4" href="#main-content">Skip to content</a>
      <aside className="app-rail">
        <div className="flex h-12 items-center border-b border-[color:var(--hairline)] px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="RiskOps home">
            <ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" aria-hidden="true" />
            <span className="text-base font-semibold">RiskOps</span>
          </Link>
        </div>
        <nav aria-label="Sections" className="flex-1 overflow-y-auto pt-6"><NavLinks orientation="rail" /></nav>
        <div className="border-t border-[color:var(--hairline)] px-4 py-4 text-xs text-[color:var(--ink-muted)]">
          Shared demo access<br />Fictional FinPay data
        </div>
      </aside>
      <div className="app-column flex min-h-screen flex-col">
        <header className="app-header">
          <div className="app-mobile-bar">
            <Link href="/" className="text-sm font-semibold" aria-label="RiskOps home">FinPay Solutions</Link>
            <ApiStatusPill />
          </div>
          <div className="app-mobile-nav"><NavLinks orientation="strip" /></div>
          <div className="app-desktop-bar">
            <div className="flex items-center gap-4"><span className="text-sm font-medium">FinPay Solutions</span><span className="text-xs text-[color:var(--ink-muted)]">Security operations</span></div>
            <ApiStatusPill />
          </div>
        </header>
        <main id="main-content" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
