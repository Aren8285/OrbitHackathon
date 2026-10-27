import { cn } from '@/lib/format';

type RiskCardProps = {
  title: string;
  value?: string | number;
  subtitle?: string | null;
  accent?: 'blue' | 'cyan' | 'green' | 'amber' | 'rose' | 'purple';
  icon?: React.ReactNode;
  className?: string;
  pulse?: boolean;
  trend?: { label: string; value: number };
  loading?: boolean;
  valueFormatter?: (value: string | number) => string;
};

const accentClasses: Record<RiskCardProps['accent'], string> = {
  blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/20 text-blue-300 accent-blue',
  cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20 text-cyan-300 accent-cyan',
  green: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-300 accent-green',
  amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/20 text-amber-300 accent-amber',
  rose: 'from-rose-500/20 to-rose-600/10 border-rose-500/20 text-rose-300 accent-rose',
  purple: 'from-violet-500/20 to-violet-600/10 border-violet-500/20 text-violet-300 accent-purple',
};

function TrendIndicator({ trend }: { trend?: RiskCardProps['trend'] }) {
  if (!trend) return null;
  const positive = trend.value >= 0;
  return (
    <div className="flex items-center gap-1 text-xs font-medium">
      <svg
        className={cn(
          'h-3.5 w-3.5',
          positive ? 'text-emerald-400' : 'text-rose-400',
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={positive ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7-7H3'}
        />
      </svg>
      <span className={cn(positive ? 'text-emerald-300' : 'text-rose-300')}>
        {positive ? '+' : ''}
        {trend.value.toFixed(1)}%
      </span>
      <span className="text-slate-500">{trend.label}</span>
    </div>
  );
}

export default function RiskCard({
  title,
  value,
  subtitle,
  accent = 'blue',
  icon,
  className,
  pulse = false,
  trend,
  loading = false,
  valueFormatter,
}: RiskCardProps) {
  const accentClass = accentClasses[accent];
  const displayValue =
    value !== undefined ? (valueFormatter?.(value) ?? String(value)) ?? '—' : '—';

  if (loading) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-slate-700/40 bg-slate-900/40 p-5 transition-all',
          className,
        )}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded-full skeleton" />
            <div className="h-7 w-28 rounded-full skeleton" />
          </div>
          <div className="h-8 w-8 rounded-lg skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-slate-900/50 p-5 transition-all duration-200',
        'hover:border-opacity-100 hover:bg-slate-900/70',
        'before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br',
        'before:opacity-0 before:transition-opacity group-hover:before:opacity-100',
        'after:absolute after:-z-10 after:inset-0 after:rounded-2xl',
        'after:bg-gradient-to-br after:from-white/[0.02] after:to-transparent',
        accentClass,
        className,
      )}
    >
      {/* Subtle accent glow */}
      <div
        className={cn(
          'absolute -right-12 -top-12 h-28 w-28 rounded-full blur-3xl opacity-40 transition-opacity group-hover:opacity-60',
          accent === 'blue' && 'bg-blue-500/30',
          accent === 'cyan' && 'bg-cyan-500/30',
          accent === 'green' && 'bg-emerald-500/30',
          accent === 'amber' && 'bg-amber-500/30',
          accent === 'rose' && 'bg-rose-500/30',
          accent === 'purple' && 'bg-violet-500/30',
        )}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-slate-500">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                'text-3xl font-semibold tracking-tight tabular-nums transition-colors group-hover:text-white',
                accent === 'blue' && 'text-blue-200',
                accent === 'cyan' && 'text-cyan-200',
                accent === 'green' && 'text-emerald-200',
                accent === 'amber' && 'text-amber-200',
                accent === 'rose' && 'text-rose-200',
                accent === 'purple' && 'text-violet-200',
              )}
            >
              {displayValue}
            </span>
            {accent === 'cyan' && pulse && (
              <span className="absolute -right-1 h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping opacity-70" />
            )}
          </div>
          {subtitle ? (
            <p className="mt-1.5 text-xs text-slate-500">{subtitle}</p>
          ) : null}
          <TrendIndicator trend={trend} />
        </div>
        {icon ? (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-slate-800/60 text-slate-400 transition-all group-hover:border-opacity-50 group-hover:text-white',
              accent === 'blue' && 'hover:border-blue-400/40 hover:text-blue-300',
              accent === 'cyan' && 'hover:border-cyan-400/40 hover:text-cyan-300',
              accent === 'green' && 'hover:border-emerald-400/40 hover:text-emerald-300',
              accent === 'amber' && 'hover:border-amber-400/40 hover:text-amber-300',
              accent === 'rose' && 'hover:border-rose-400/40 hover:text-rose-300',
              accent === 'purple' && 'hover:border-violet-400/40 hover:text-violet-300',
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
