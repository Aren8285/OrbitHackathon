'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type AssetRiskRankingRuntime,
  type OptimizerRecommendationRuntime,
  type RiskSummaryRuntime,
  type SimulationResultRuntime,
  api,
  mapApiError,
} from '@/lib';
import CopilotPanel from '@/components/CopilotPanel';
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  priorityColor,
} from '@/lib/format';

type Status = 'loading' | 'ready' | 'empty' | 'error';

type DashboardData = {
  summary: RiskSummaryRuntime;
  simulation: SimulationResultRuntime;
  optimizer: OptimizerRecommendationRuntime;
  assets: AssetRiskRankingRuntime[];
};

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  /**
   * Severity semantic, not decoration: the metric itself carries the color
   * (expected loss is the working number; the P95 tail reads as risk (rose);
   * inventory counts stay neutral).
   */
  tone?: 'working' | 'risk' | 'warn' | 'neutral' | 'good';
  icon?: React.ReactNode;
};

function MetricCard({ label, value, sub, tone = 'working', icon }: MetricCardProps) {
  const tones: Record<string, string> = {
    working: 'text-[color:var(--ink-primary)]',
    risk: 'text-[color:var(--ink-primary)]',
    warn: 'text-[color:var(--ink-primary)]',
    neutral: 'text-[color:var(--ink-primary)]',
    good: 'text-[color:var(--severity-emerald)]',
  };
  return (
    <div className="kpi-item">
      <div className="flex items-center justify-between gap-2">
        <div className="kpi-label">{label}</div>
        {icon && <div className="text-[color:var(--ink-faint)]">{icon}</div>}
      </div>
      <div className={cn('kpi-value', tones[tone])}>
        {value}
      </div>
      {sub && <div className="kpi-detail">{sub}</div>}
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
    <div className={cn('risk-panel', className)}>
      <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-4 py-3">
        <h2 className="text-sm font-medium text-[color:var(--ink-secondary)]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const summary = await api.risk.summary();
      if (summary.total_assets === 0) {
        setData(null); setStatus('empty'); return;
      }
      const [simulation, optimizer, assets] = await Promise.all([
        api.simulation.portfolio(),
        api.optimizer.full({
          budget_inr: 5_000_000,
        }),
        api.risk.assetRankings(),
      ]);
      setData({ summary, simulation, optimizer, assets });
      setStatus(summary.total_assets === 0 ? 'empty' : 'ready');
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

  const lossDistribution = useMemo(() => (data?.simulation.histogram ?? []).map(bin => ({
    loss: (bin.low_inr + bin.high_inr) / 2 / 100000, count: bin.count,
  })), [data]);

  const topAssets = useMemo(() => {
    if (!data) return [];
    return data.assets
      .slice()
      .sort((a, b) => a.priority_label.localeCompare(b.priority_label) || b.max_priority - a.max_priority)
      .slice(0, 8)
      .map((a) => ({
        name: a.asset_name.length > 14 ? `${a.asset_name.slice(0, 13)}…` : a.asset_name,
        asset_id: a.asset_id,
        priority: Number(a.max_priority.toFixed(3)),
        technical: Number(a.max_technical_risk.toFixed(3)),
        findings: a.open_findings,
      }));
  }, [data]);

  const topRisks = useMemo(() => data?.summary.top_risks.slice(0, 5) ?? [], [data]);

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

  const loadDemo = async () => {
    setSeeding(true); setError(null);
    try { await api.demo.seed(); await fetchData(); }
    catch (err) { setError(mapApiError(err)); setStatus('error'); }
    finally { setSeeding(false); }
  };
  const demoAction = <div className="text-left">
    <button type="button" disabled={seeding} onClick={() => void loadDemo()}
      className="rounded border border-[color:var(--hairline-strong)] bg-[color:var(--accent-soft)] px-4 py-2 text-sm text-[color:var(--ink-primary)] disabled:opacity-50">
      {seeding ? 'Loading FinPay demo...' : 'Load FinPay demo'}
    </button>
    {seeding
      ? <p role="status" aria-live="polite" className="mt-2 flex items-center gap-2 text-xs text-[color:var(--ink-secondary)]"><span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border border-[color:var(--hairline-strong)] border-t-[color:var(--accent)]" />Loading demo data and calculating risk...</p>
      : <p className="mt-1 text-xs text-slate-500">Replaces demo data and calculates risk in one step.</p>}
  </div>;

  const refresh = () => fetchData();

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-6 py-6">
        <div className="mb-4">{demoAction}</div>
        <div className="mb-6 h-7 w-64 skeleton" />
        <div className="kpi-strip mb-6">
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
        {demoAction}
        <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
        >
          Retry connection
        </button>
      </div>
    );
  }

  if (status === 'empty' || !data) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 py-16 text-center">
        {demoAction}
        <p className="text-sm text-slate-400">
          No data yet. Load the FinPay demo to populate the dashboard.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
        >
          Refresh
        </button>
      </div>
    );
  }

  const sim = data.simulation;
  const optim = data.optimizer;

  /* Chart dressing shared by every Recharts panel on this page — hairline
   * grid, muted ticks, ledger tooltip. */
  const chartGrid = '#303740';
  const chartTick = { fill: 'var(--ink-muted)', fontSize: 12 };
  const chartTooltip = {
    background: 'var(--surface-panel)',
    border: '1px solid var(--hairline-strong)',
    borderRadius: 4,
    fontFamily: 'var(--font-mono), monospace',
    fontSize: 12,
    color: 'var(--ink-primary)',
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 py-6">
      <div className="page-heading">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ink-primary)]">
            Risk overview
          </h1>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Annual loss across FinPay assets. {formatNumber(sim.iterations)} simulation runs; seed <span className="risk-id">{sim.seed}</span>.
          </p>
        </div>
        <div className="page-actions">{demoAction}<button
          type="button"
          onClick={refresh}
          className="risk-inset px-4 py-2 text-sm text-[color:var(--ink-secondary)] hover:text-[color:var(--ink-primary)]"
        >
          Refresh
        </button></div>
      </div>

      {/* metric cards */}
      <div className="kpi-strip mb-6">
        <MetricCard
          label="Expected annual loss"
          value={formatCurrency(sim.expected_annual_loss_inr, {
            currency: true,
            compact: true,
          })}
          sub={`P50 ${formatCurrencyCompact(sim.p50_inr)}`}
          tone="working"
        />
        <MetricCard
          label="P95 annual loss"
          value={formatCurrency(sim.p95_inr, { currency: true, compact: true })}
          sub={`P99 ${formatCurrencyCompact(sim.p99_inr)}`}
          tone="risk"
        />
        <MetricCard
          label="Overall risk score"
          value={`${(data.summary.overall_risk_score * 100).toFixed(1)}%`}
          sub={`${data.summary.total_assets.toLocaleString('en-IN')} assets total`}
          tone="warn"
        />
        <MetricCard
          label="Open P0 / P1"
          value={data.summary.open_p0_p1_count.toLocaleString('en-IN')}
          sub={`${data.summary.kev_vulnerabilities.toLocaleString('en-IN')} on CISA KEV`}
          tone="neutral"
        />
      </div>

      {/* charts row */}
      <div className="mb-6 grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel
          title="Financial loss distribution"
          action={
            <span className="text-xs text-slate-500">
              {sim.histogram.length} bins · loss in ₹ lakh
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={lossDistribution} margin={{ top: 24, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="3 4" />
              <XAxis dataKey="loss" type="number" domain={[(sim.histogram[0]?.low_inr ?? 0)/100000, (sim.histogram[39]?.high_inr ?? 100000)/100000]} tick={chartTick} tickFormatter={value => `${Number(value).toFixed(0)}L`} />
              <YAxis tick={chartTick} />
              <Tooltip contentStyle={chartTooltip} labelFormatter={value => formatCurrencyCompact(Number(value) * 100_000)} />
              <Bar isAnimationActive={false} dataKey="count" fill="#9cb7ca" />
              <ReferenceLine x={sim.p50_inr / 100000} label={{value:"P50", position:"top", fill:"#bcc3ca", fontSize:12, fontFamily:'var(--font-mono), monospace'}} stroke="#bcc3ca" strokeDasharray="3 3" />
              <ReferenceLine x={sim.p95_inr / 100000} label={{value:"P95", position:"top", fill:"#c4ad7d", fontSize:12, fontFamily:'var(--font-mono), monospace'}} stroke="#c4ad7d" strokeDasharray="3 3" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* risk by asset */}
        <Panel
          title="Risk by asset"
          action={<span className="text-xs text-slate-500">priority (0–1)</span>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topAssets} layout="vertical" margin={{ top: 8, right: 40, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="3 4" horizontal={false} />
              <XAxis type="number" tick={chartTick} domain={[0, 1]} />
              <YAxis dataKey="name" type="category" tick={{ ...chartTick, fontSize: 12 }} width={112} tickLine={false} />
              <Tooltip contentStyle={chartTooltip} />
              <Bar dataKey="priority" fill="var(--accent)" radius={0} isAnimationActive={false}>
                <LabelList dataKey="priority" position="right" formatter={(value: unknown) => Number(value).toFixed(2)} fill="#bcc3ca" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* before/after + top risks */}
      <div className="mb-6 grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
        <Panel
          title="Before vs after remediation"
          action={
            <span className="text-xs text-slate-500">
              portfolio · {formatCurrencyCompact(optim.budget_inr)} budget
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={beforeAfter} margin={{ top: 24, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={chartGrid} strokeDasharray="3 4" />
              <XAxis dataKey="phase" tick={chartTick} />
              <YAxis tick={chartTick} tickFormatter={(v: number) => `${v}L`} />
              <Tooltip
                contentStyle={chartTooltip}
                formatter={(value: number) =>
                  formatCurrency(value * 100000, { currency: false, compact: true })
                }
                labelStyle={{ color: 'var(--ink-secondary)' }}
              />
              <Bar isAnimationActive={false} dataKey="residual" radius={[4, 4, 0, 0]}>
                <Cell fill="#65707a" />
                <Cell fill="#9cb7ca" />
                <LabelList dataKey="residual" position="top" formatter={(value: unknown) => formatCurrencyCompact(Number(value) * 100000)} fill="#bcc3ca" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 text-xs text-slate-500">
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
            <span className="text-xs text-slate-500">
              Priority order
            </span>
          }
        >
          {topRisks.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No open findings to rank.
            </div>
          ) : (
            <div className="table-scroll"><table>
              <thead><tr><th>Asset</th><th>Priority</th><th className="numeric">Expected loss</th><th className="numeric">P95</th></tr></thead>
              <tbody>{topRisks.map((r) => <tr key={r.asset_id}>
                <td><div className="text-sm font-medium">{r.asset_name}</div><div className="risk-id mt-1 text-slate-400">{r.asset_id}</div>{r.coverage === 'none' && <div className="mt-1 text-xs text-slate-500">{r.coverage_reason}</div>}</td>
                <td><span className={priorityColor(r.priority_label)}>{r.priority_label}</span></td>
                <td className="numeric money">{r.expected_annual_loss_inr == null ? '—' : formatCurrencyCompact(r.expected_annual_loss_inr)}</td>
                <td className="numeric money">{r.p95_inr == null ? '—' : formatCurrencyCompact(r.p95_inr)}</td>
              </tr>)}</tbody>
            </table></div>
          )}
        </Panel>
      </div>

      <Panel
        title="Recommended controls"
        action={
          <span className="text-xs text-slate-500">
            never exceeds {formatCurrencyCompact(optim.budget_inr)} budget
          </span>
        }
      >
        {recommended.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No controls fit within the current budget.
          </div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Control</th><th className="numeric">Annual cost</th><th className="numeric">Benefit / rupee</th><th className="numeric">Loss after</th><th className="numeric">Effectiveness</th></tr></thead>
            <tbody>{recommended.map((c) => <tr key={c.control_key}>
              <td><div>{c.control_name}</div><div className="risk-id text-slate-400">{c.control_key}</div></td>
              <td className="numeric">{formatCurrencyCompact(c.annual_cost_inr)}</td>
              <td className="numeric">{c.benefit_per_rupee != null ? c.benefit_per_rupee.toFixed(2) : '—'}</td>
              <td className="numeric">{formatCurrencyCompact(c.residual_after_inr)}</td>
              <td className="numeric">{Math.round(c.effectiveness * 100)}%</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Panel>

      <CopilotPanel />
    </div>
  );
}
