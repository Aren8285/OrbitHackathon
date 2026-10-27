import Link from 'next/link';
import type { ReactElement } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/format';

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/assets', label: 'Assets', icon: 'shield' },
  { href: '/vulnerabilities', label: 'Vulnerabilities', icon: 'alert' },
  { href: '/risk', label: 'Risk', icon: 'grid' },
  { href: '/scenarios', label: 'Scenarios', icon: 'tuning' },
  { href: '/optimizer', label: 'Budget Optimizer', icon: 'sliders' },
  { href: '/remediation', label: 'Remediation', icon: 'check' },
];

type IconName = (typeof NAV)[number]['icon'];

const ICON_MAP: Record<IconName, ReactElement> = {
  home: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  shield: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 10.5l-2.25-4.5L9 12.75zM12 21a9 9 0 100-18 9 9 0 000 18z" />
    </svg>
  ),
  alert: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  grid: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  tuning: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-12h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  ),
  sliders: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-12h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 10.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function CopilotSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col border-r border-slate-700/40 bg-slate-900/60">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.35)]">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 10.5m-3-7.5L12 3l3.75 4.5" />
          </svg>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-100">RiskOps</span>
          <span className="block text-[0.6rem] uppercase tracking-widest text-cyan-400/70">
            Cyber Risk Ops
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-cyan-500/10 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.15)]'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
              )}
            >
              <span className={cn(
                'shrink-0 transition-colors',
                isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300',
              )}>
                {ICON_MAP[item.icon]}
              </span>
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="ml-auto h-0.5 w-1.5 rounded-full bg-cyan-400" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-700/30 p-4">
        <div className="rounded-lg border border-slate-700/30 bg-slate-800/40 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-400">Tip</p>
          <p className="mt-1">Live data requires the backend on{' '}
            <code className="rounded bg-slate-700/60 px-1 py-0.5 text-cyan-300 text-[0.65rem]">
              localhost:8000
            </code>.
          </p>
        </div>
      </div>
    </aside>
  );
}
