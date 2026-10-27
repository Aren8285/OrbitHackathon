'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/format';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  accent?: 'blue' | 'cyan' | 'green' | 'amber' | 'rose';
};

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Executive Dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: '/assets',
    label: 'Assets',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
  },
  {
    href: '/vulnerabilities',
    label: 'Vulnerabilities',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    ),
  },
  {
    href: '/scenarios',
    label: 'Risk Scenarios',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    href: '/optimizer',
    label: 'Budget Optimizer',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    accent: 'cyan',
  },
  {
    href: '/remediation',
    label: 'Remediation',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
];

interface NavBarProps {
  className?: string;
}

export default function NavBar({ className }: NavBarProps) {
  const pathname = usePathname();

  const mobileNav = () => (
    <nav className={cn('flex flex-wrap gap-1 pb-2', className)}>
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-cyan-300 hover:bg-slate-800/50',
              active && 'text-cyan-300 bg-slate-800/60',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && item.badge !== '' && (
              <span
                className={cn(
                  'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[0.65rem] font-semibold',
                  item.accent === 'cyan' && 'bg-cyan-500/20 text-cyan-300',
                  item.accent === 'amber' && 'bg-amber-500/20 text-amber-300',
                  item.accent === 'rose' && 'bg-rose-500/20 text-rose-300',
                  !item.accent && 'bg-slate-700/40 text-slate-400',
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = () => (
    <aside className="flex h-14 shrink-0 items-center border-r border-slate-700/40 bg-slate-900/50">
      <nav className="flex items-center gap-1 px-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'nav-item text-sm font-medium transition-all',
                active && 'active text-cyan-300',
              )}
            >
              <span className="mr-2.5 shrink-0">{item.icon}</span>
              {item.label}
              {item.badge !== undefined && item.badge !== '' && (
                <span
                  className={cn(
                    'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[0.65rem] font-semibold',
                    item.accent === 'cyan' && 'bg-cyan-500/20 text-cyan-300',
                    !item.accent && 'bg-slate-700/40 text-slate-400',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <header className={cn('flex items-center border-b border-slate-700/40 bg-slate-900/60', className)}>
      {sidebar()}
      <div className="flex flex-1 items-center justify-end gap-3 px-4">
        {/* compact status pill */}
        <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-700/40 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400">
          <span className="status-dot ok" />
          <span className="tabular-nums">API ready</span>
        </div>

        <div className="flex items-center gap-2">
          {/* mock signed-in avatar for demo */}
          <div className="flex items-center gap-2 rounded-full bg-slate-800/70 px-2.5 py-1.5 text-sm">
            <span className="text-slate-400">Rahul</span>
            <span className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 p-0.5">
              <span className="ml-[-6px] mr-[-6px] mt-[-6px] mb-[-6px] block h-5 w-5 rounded-full bg-slate-900 flex items-center justify-center text-[9px] font-bold text-cyan-200">
                R
              </span>
            </span>
          </div>
        </div>
      </div>
      {/* Mobile nav overlay */}
      <div className="flex md:hidden items-center">{mobileNav()}</div>
    </header>
  );
}

