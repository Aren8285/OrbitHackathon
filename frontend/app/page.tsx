'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  AreaChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type AssetRiskRankingRuntime,
  type FindingRankingRuntime,
  type OptimizerRecommendationRuntime,
  type RiskSummaryRuntime,
  type SimulationResultRuntime,
  api,
  mapApiError,
} from '@/lib';import CopilotPanel from '@/components/CopilotPanel';
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  priorityColor,
} from '@/lib/format';

type Status = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Demo-scenario asset: FinPay's Payment Processing Database (A-001), the
 * focus asset defined in coder.md. Its simulation comes from the asset's
 * EDITABLE impact assumptions (GET /simulation/assets/A-001) — no baseline
 * zeros are hardcoded here.
 */
const FOCUS_ASSET_ID = 'A-001';


type DashboardData = {
  summary: RiskSummaryRuntime;
  simulation: SimulationResultRuntime;
  optimizer: OptimizerRecommendationRuntime;
  rankings: FindingRankingRuntime[];
  assets: AssetRiskRankingRuntime[];
};

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  tone?: 'cyan' | 'blue' | 'amber' | 'rose' | 'emerald';
  icon?: React.ReactNode;
};

function MetricCard({ label, value, sub, tone = 'cyan', icon }: MetricCardProps) {
  const tones: Record<string, string> = {
    cyan: 'text-cyan-200',
    blue: 'text-blue-200',
    amber: 'text-amber-200',
    rose: 'text-rose-200',
    emerald: 'text-emerald-200',
  };
  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 p-5 transition-all hover:border-cyan-500/30 hover:bg-slate-900/70">
      <div className="flex items-center justify-between">
        <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">{label}</div>
        {icon && <div className="text-slate-600">{icon}</div>}
      </div>
      <div className={cn('mt-2 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</div>
      {sub && <div className="mt-1 text-[0.7rem] text-slate-500">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-slate-700/40 bg-slate-900/50', className)}>
      <div className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/70 px-5 py-3">
        <h2 className="text-sm font-medium text-slate-300">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const KEV_CHART_COLORS = ['#22d3ee', '#3b82f6', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'];

export default function ExecutiveDashboard() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [summary, simulation, optimizer, rankings, assets] = await Promise.all([
        api.risk.summary(),
        // GET /simulation/assets/{id} returns the simulation at the ROOT of the
        // response (unlike POST /simulation/run which wraps it in { simulation }).
        api.simulation.asset(FOCUS_ASSET_ID),
        api.optimizer.full({
          budget_inr: 5_000_000,
          asset_id: FOCUS_ASSET_ID,
        }),
        api.findingRankings.list(true),
        api.risk.assetRankings(),
      ]);
      setData({ summary, simulation, optimizer, rankings, assets });
      setStatus('ready');
    } catch (err) {
      setError(mapApiError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    // Defer one microtask so the setState inside fetchData is not called
    // synchronously during the effect (react-hooks/set-state-in-effect).
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const lossDistribution = useMemo(() => {
    if (!data || !data.simulation) return [];
    const sim = data.simulation;
    return (
      [
        ['P10', sim.p10_inr],
        ['P25', sim.p25_inr],
        ['P50', sim.p50_inr],
        ['P75', sim.p75_inr],
        ['P90', sim.p90_inr],
        ['P95', sim.p95_inr],
        ['P99', sim.p99_inr],
      ] as Array<[string, number]>
    ).map(([key, value]) => ({ key, value: value / 100000 }));
  }, [data]);

  const topAssets = useMemo(() => {
    if (!data) return [];
    return data.assets
      .slice()
      .sort((a, b) => b.max_priority - a.max_priority)
      .slice(0, 8)
      .map((a) => ({
        name: a.asset_name.length > 14 ? `${a.asset_name.slice(0, 13)}…` : a.asset_name,
        asset_id: a.asset_id,
        priority: Number(a.max_priority.toFixed(3)),
        technical: Number(a.max_technical_risk.toFixed(3)),
        findings: a.open_findings,
      }));
  }, [data]);

  const topRisks = useMemo(() => data?.rankings.slice(0, 5) ?? [], [data]);

  const beforeAfter = useMemo(() => {
    if (!data) return [];
    const optim = data.optimizer;
    return [
      { phase: 'Before', residual: optim.residual_before_inr / 100000 },
      { phase: 'After', residual: optim.residual_after_inr / 100000 },
    ];
  }, [data]);

  const recommended = useMemo(
    () => (data ? data.optimizer.recommended_controls.slice(0, 4) : []),
    [data],
  );

  const refresh = () => fetchData();

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-6 h-7 w-64 skeleton" />
        <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 skeleton" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 skeleton" />
          <div className="h-64 skeleton" />
        </div>
        <p className="sr-only">Loading dashboard…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
        >
          Retry connection
        </button>
      </div>
    );
  }

  if (status === 'empty' || !data) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="text-sm text-slate-400">
          No data yet. Seed the FinPay demo data or upload the CSV datasets once the
          backend is running on localhost:8000.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
        >
          Refresh
        </button>
      </div>
    );
  }

  const sim = data.simulation;
  const optim = data.optimizer;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Executive Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Loss exposure for {sim.asset_id ?? 'the demo scenario'} — editable
            assumptions, {formatNumber(sim.iterations)} Monte Carlo iterations,
            seed {sim.seed}.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-xl border border-slate-700/50 bg-slate-900/60 px-3.5 py-2 text-xs text-slate-400 transition hover:border-cyan-500/30 hover:text-cyan-200"
        >
          Refresh
        </button>
      </div>

      {/* metric cards */}
      <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Expected annual loss"
          value={formatCurrency(sim.expected_annual_loss_inr, {
            currency: false,
            compact: false,
          })}
          sub={`P50 ${formatCurrencyCompact(sim.p50_inr)}`}
          tone="cyan"
        />
        <MetricCard
          label="P95 annual loss"
          value={formatCurrency(sim.p95_inr, { currency: false, compact: false })}
          sub={`P99 ${formatCurrencyCompact(sim.p99_inr)}`}
          tone="rose"
        />
        <MetricCard
          label="Critical assets"
          value={data.summary.critical_assets.toLocaleString('en-IN')}
          sub={`${data.summary.total_assets.toLocaleString('en-IN')} assets total`}
          tone="amber"
        />
        <MetricCard
          label="Open vulnerabilities"
          value={data.summary.open_vulnerabilities.toLocaleString('en-IN')}
          sub={`${data.summary.kev_vulnerabilities.toLocaleString('en-IN')} on CISA KEV`}
          tone="blue"
        />
      </div>

      {/* charts row */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Financial loss distribution"
          action={
            <span className="text-[0.65rem] text-slate-500">
              percentiles in ₹ lakh
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={lossDistribution} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 4" />
              <XAxis dataKey="key" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v: number) => `₹${v}`} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 12,
                  color: '#e2e8f0',
                }}
                formatter={(value: number) =>
                  formatCurrency(value * 100000, { currency: false, compact: true })
                }
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22d3ee"
                strokeWidth={2.5}
                fill="url(#lossFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        {/* risk by asset */}
        <Panel
          title="Risk by asset"
          action={<span className="text-[0.65rem] text-slate-500">priority (0–1)</span>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topAssets} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 4" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(label: string) => (String(label).length > 12 ? `${String(label).slice(0, 11)}…` : label)}
                angle={35}
                dy={8}
                height={64}
                interval={0}
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 12,
                  color: '#e2e8f0',
                }}
              />
              <Bar dataKey="priority" radius={[4, 4, 0, 0]}>
                {topAssets.map((a, i) => (
                  <Cell key={a.asset_id} fill={KEV_CHART_COLORS[i % KEV_CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* before/after + top risks */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Before vs after remediation"
          action={
            <span className="text-[0.65rem] text-slate-500">
              asset {optim.asset_id} · ₹{formatCurrencyCompact(optim.budget_inr)} budget
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={beforeAfter} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 4" />
              <XAxis dataKey="phase" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v: number) => `₹${v}`} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 12,
                  color: '#e2e8f0',
                }}
                formatter={(value: number) =>
                  formatCurrency(value * 100000, { currency: false, compact: true })
                }
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="residual" radius={[4, 4, 0, 0]}>
                <Cell fill="#fb7185" />
                <Cell fill="#34d399" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 text-center text-[0.7rem] text-slate-500">
            Residual loss reduction:{' '}
            <span className="text-emerald-200">
              {formatCurrencyCompact(optim.total_expected_reduction_inr)}
            </span>{' '}
            annualized
          </div>
        </Panel>

        <Panel
          title="Top 5 risks"
          action={
            <span className="text-[0.65rem] text-slate-500">
              by impact × exposure
            </span>
          }
        >
          {topRisks.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No open findings to rank.
            </div>
          ) : (
            <div className="space-y-2">
              {topRisks.map((r, i) => (
                <div
                  key={`${r.cve_id}-${r.asset_id}`}
                  className="flex items-start gap-3 rounded-lg border border-slate-700/30 bg-slate-800/30 px-3 py-2"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-400/20 bg-gradient-to-br from-blue-500/20 to-cyan-500/10 text-[0.65rem] font-bold text-cyan-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-200">{r.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[0.7rem] text-slate-500">
                      <span>{r.cve_id}</span>
                      <span className="text-slate-700">·</span>
                      <span className="font-sans">{r.asset_name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {r.is_kev && (
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[0.6rem] font-medium text-rose-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                        KEV
                      </span>
                    )}
                    <div className={cn('text-sm font-semibold tabular-nums', priorityColor(r.priority))}>
                      {r.priority.toFixed(3)}
                    </div>
                    <div className="text-[0.6rem] text-slate-500">priority</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Recommended controls"
        action={
          <span className="text-[0.65rem] text-slate-500">
            never exceeds ₹{formatCurrencyCompact(optim.budget_inr)} budget
          </span>
        }
      >
        {recommended.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No controls fit within the current budget.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {recommended.map((c, i) => (
              <div
                key={c.control_key}
                className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4 transition hover:border-cyan-500/30"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-mono text-sm font-semibold text-cyan-200">
                    {c.control_key}
                  </h3>
                  <span className="text-[0.65rem] text-slate-500">#{i + 1}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-300">
                  {c.control_name}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[0.7rem]">
                  <div>
                    <div className="text-slate-500">Cost/yr</div>
                    <div className="font-semibold tabular-nums text-slate-200">
                      {formatCurrencyCompact(c.annual_cost_inr)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Benefit/₹</div>
                    <div className="font-semibold tabular-nums text-emerald-200">
                      {c.benefit_per_rupee != null ? (
                        c.benefit_per_rupee.toFixed(2)
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Residual after</div>
                    <div className="font-semibold tabular-nums text-rose-200">
                      {formatCurrencyCompact(c.residual_after_inr)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500/80 to-blue-500/80 transition-all duration-500"
                    style={{ width: `${Math.min(100, c.effectiveness * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[0.6rem] text-slate-600">
                  effectiveness {Math.round(c.effectiveness * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <CopilotPanel />
    </div>
  );
}
