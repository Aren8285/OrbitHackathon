'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type SimulationRequest, type SimulationResult, mapApiError } from '@/lib';
import { cn, formatCurrency } from '@/lib/format';
import LossCurveChart from '@/components/LossCurveChart';

type ScenarioState = {
  result: SimulationResult | null;
  running: boolean;
  error: string | null;
  lastRun: Date | null;
};

const DEFAULT_SEVERITY_LOW = 5_000_000;
const DEFAULT_SEVERITY_LIKELY = 25_000_000;
const DEFAULT_SEVERITY_HIGH = 80_000_000;

function SeverityInput({
  label,
  value,
  onChange,
  min = 0,
  max = 500_000_000,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <label className="text-slate-400">{label}</label>
        {hint && <span className="text-[0.65rem] text-slate-600">{hint}</span>}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
          ₹
        </span>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(min, Math.min(max, n)));
          }}
          disabled={disabled}
          className={cn(
            'h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 pl-7 pr-3 text-sm text-slate-100 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
      </div>
    </div>
  );
}

function SimulationControls({
  request,
  onRequestChange,
  disabled,
}: {
  request: SimulationRequest;
  onRequestChange: (r: SimulationRequest) => void;
  disabled?: boolean;
}) {
  const update = useCallback(
    (key: keyof SimulationRequest, value: number | boolean) => {
      onRequestChange({ ...request, [key]: value });
    },
    [request, onRequestChange],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SeverityInput
        label="Downtime cost (INR per event)"
        value={request.downtime_inr ?? 0}
        onChange={(v) => update('downtime_inr', v)}
        hint="lost revenue per hour × downtime hours"
      />
      <SeverityInput
        label="Recovery cost (INR per event)"
        value={request.recovery_inr ?? 0}
        onChange={(v) => update('recovery_inr', v)}
        hint="forensics + remediation per incident"
      />
      <SeverityInput
        label="Regulatory / penalty (INR per event)"
        value={request.regulatory_inr ?? 0}
        onChange={(v) => update('regulatory_inr', v)}
        hint="fines, legal, breach notification"
      />
      <SeverityInput
        label="Reputation / customer churn (INR per event)"
        value={request.reputation_inr ?? 0}
        onChange={(v) => update('reputation_inr', v)}
        hint="estimated churn + brand damage"
      />

      <div className="sm:col-span-2">
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SeverityInput
            label="Severity — Low (INR)"
            value={request.severity_low_inr ?? DEFAULT_SEVERITY_LOW}
            onChange={(v) => update('severity_low_inr', v)}
            hint="minor incident"
          />
          <SeverityInput
            label="Severity — Likely (INR)"
            value={request.severity_likely_inr ?? DEFAULT_SEVERITY_LIKELY}
            onChange={(v) => update('severity_likely_inr', v)}
            hint="most probable outcome"
          />
          <SeverityInput
            label="Severity — High (INR)"
            value={request.severity_high_inr ?? DEFAULT_SEVERITY_HIGH}
            onChange={(v) => update('severity_high_inr', v)}
            hint="worst plausible outcome"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Events per year</span>
          </div>
          <input
            type="number"
            min={0}
            max={50}
            step={0.1}
            value={request.frequency_per_year ?? 2}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              update('frequency_per_year', Math.max(0, Math.min(50, n)));
            }}
            disabled={disabled}
            className={cn(
              'h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 text-sm text-slate-100 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Compromise probability</span>
          </div>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={(request.compromise_probability ?? 0.5) * 100}
            onChange={(e) => {
              const n = Number(e.target.value) / 100;
              if (!Number.isFinite(n)) return;
              update('compromise_probability', Math.max(0, Math.min(1, n)));
            }}
            disabled={disabled}
            className={cn(
              'h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 text-sm text-slate-100 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Iterations</span>
          </div>
          <input
            type="number"
            min={1000}
            max={50000}
            step={1000}
            value={request.iterations ?? 10000}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              update('iterations', Math.max(1000, Math.min(50000, n)));
            }}
            disabled={disabled}
            className={cn(
              'h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 text-sm text-slate-100 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Seed (reproducible)</span>
          </div>
          <input
            type="number"
            value={request.seed ?? 20261027}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              update('seed', n);
            }}
            disabled={disabled}
            className={cn(
              'h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 text-sm text-slate-100 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>
      </div>
    </div>
  );
}

function DistributionChart({
  result,
  loading,
}: {
  result: SimulationResult | null;
  loading: boolean;
}) {
  const data = useMemo(() => {
    if (!result) return [];
    const steps = 40;
    return Array.from({ length: steps }, (_, i) => {
      const percent = ((i + 1) / steps) * 100;
      // Use percentiles we have; interpolate linearly between neighbours.
      const points: Array<{ p: number; v: number }> = [
        { p: 0, v: 0 },
        ...(result.p10_inr != null ? [{ p: 10, v: result.p10_inr }] : []),
        ...(result.p25_inr != null ? [{ p: 25, v: result.p25_inr }] : []),
        ...(result.p50_inr != null ? [{ p: 50, v: result.p50_inr }] : []),
        ...(result.p75_inr != null ? [{ p: 75, v: result.p75_inr }] : []),
        ...(result.p90_inr != null ? [{ p: 90, v: result.p90_inr }] : []),
        ...(result.p95_inr != null ? [{ p: 95, v: result.p95_inr }] : []),
        ...(result.p99_inr != null ? [{ p: 99, v: result.p99_inr }] : []),
        { p: 100, v: result.max_annual_loss_inr },
      ].sort((a, b) => a.p - b.p);

      let value = 0;
      for (let j = 0; j < points.length - 1; j++) {
        const a = points[j];
        const b = points[j + 1];
        if (percent >= a.p && percent <= b.p) {
          const t = (percent - a.p) / (b.p - a.p);
          value = a.v + t * (b.v - a.v);
          break;
        }
      }
      if (percent >= 100) value = points[points.length - 1].v;
      return { percent, loss_inr: value };
    });
  }, [result]);

  if (loading) {
    return (
      <div className="h-[220px] w-full rounded-xl border border-slate-700/40 bg-slate-900/50">
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Computing distribution…
        </div>
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full rounded-xl border border-slate-700/40 bg-slate-900/50 p-2">
      <LossCurveChart
        data={data}
        p50={result?.p50_inr}
        p95={result?.p95_inr}
        p10={result?.p10_inr}
        p90={result?.p90_inr}
        p99={result?.p99_inr}
        expected={result?.expected_annual_loss_inr}
        className="h-full"
      />
    </div>
  );
}

function StatBlock({ label, value, accent = 'blue', sub }: {
  label: string;
  value: string;
  accent?: 'blue' | 'cyan' | 'green' | 'amber' | 'rose';
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4 text-center">
      <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: accentColor(accent) }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function accentColor(accent: string): string {
  return (
    {
      blue: '#60a5fa',
      cyan: '#22d3ee',
      green: '#34d399',
      amber: '#fbbf24',
      rose: '#fb7185',
    }[accent] ?? '#94a3b8'
  );
}

function TopRiskChips() {
  const [rankings, setRankings] = useState<Array<{
    cve_id: string;
    asset_name: string;
    priority: number;
    title: string;
    is_kev: boolean;
    fictional: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await api.findingRankings.list(true);
        if (!cancelled) {
          const reduced = data
            .slice(0, 5)
            .map((r) => ({
              cve_id: r.cve_id,
              asset_name: r.asset_name,
              priority: r.priority,
              title: r.title,
              is_kev: r.is_kev,
              fictional: r.fictional,
            }));
          setRankings(reduced);
        }
      } catch (err) {
        if (!cancelled) {
          setError(mapApiError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-800/30 px-3 py-2"
          >
            <div className="h-6 w-6 rounded-full skeleton" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 skeleton" />
              <div className="h-2 w-16 skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-rose-300">{error}</div>
    );
  }

  if (rankings.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        No open findings to rank right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rankings.map((r, i) => (
        <div
          key={`${r.cve_id}-${r.asset_name}`}
          className="flex items-start gap-3 rounded-lg border border-slate-700/30 bg-slate-800/30 px-3 py-2"
        >
          <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-400/20 text-[0.65rem] font-bold text-cyan-300 flex items-center justify-center">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-200">
              {r.title}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{r.cve_id}</span>
              <span className="text-slate-600">·</span>
              <span>{r.asset_name}</span>
              {r.is_kev && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[0.6rem] font-medium text-rose-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  KEV
                </span>
              )}
              {r.fictional && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-700/40 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-400">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  demo CVE
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-cyan-300 tabular-nums">
              {r.priority.toFixed(3)}
            </div>
            <div className="text-[0.6rem] text-slate-500">priority</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ScenariosPage() {
  const [state, setState] = useState<ScenarioState>({
    result: null,
    running: false,
    error: null,
    lastRun: null,
  });
  const [request, setRequest] = useState<SimulationRequest>({
    frequency_per_year: 2,
    compromise_probability: 0.5,
    downtime_inr: 0,
    recovery_inr: 0,
    regulatory_inr: 0,
    reputation_inr: 0,
    severity_low_inr: DEFAULT_SEVERITY_LOW,
    severity_likely_inr: DEFAULT_SEVERITY_LIKELY,
    severity_high_inr: DEFAULT_SEVERITY_HIGH,
    iterations: 10000,
    seed: 20261027,
  });

  const run = useCallback(async () => {
    setState((s) => ({ ...s, running: true, error: null, lastRun: null }));
    try {
      const result = await api.simulation.run(request);
      setState((s) => ({ ...s, result, running: false, lastRun: new Date() }));
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        error: mapApiError(err),
        lastRun: null,
      }));
    }
  }, [request]);

  const resetDefaults = useCallback(() => {
    setRequest({
      frequency_per_year: 2,
      compromise_probability: 0.5,
      downtime_inr: 0,
      recovery_inr: 0,
      regulatory_inr: 0,
      reputation_inr: 0,
      severity_low_inr: DEFAULT_SEVERITY_LOW,
      severity_likely_inr: DEFAULT_SEVERITY_LIKELY,
      severity_high_inr: DEFAULT_SEVERITY_HIGH,
      iterations: 10000,
      seed: 20261027,
    });
  }, []);

  const withSeverityMode = useCallback(() => {
    setRequest((prev) => ({
      ...prev,
      severity_low_inr: DEFAULT_SEVERITY_LOW,
      severity_likely_inr: DEFAULT_SEVERITY_LIKELY,
      severity_high_inr: DEFAULT_SEVERITY_HIGH,
    }));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* header */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Risk Scenarios
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monte Carlo simulation of annual INR loss using explicit, editable inputs.
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-3 py-2 text-xs text-slate-500">
          {state.lastRun ? (
            <span className="text-slate-400">
              Last run {state.lastRun.toLocaleTimeString()}
            </span>
          ) : (
            <span className="text-slate-600">Not run yet</span>
          )}
        </div>
      </div>

      {/* main grid */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* inputs */}
        <div className="lg:col-span-2">
          <div className="risk-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">Scenario inputs</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={withSeverityMode}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Use severity mode
                </button>
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="mt-4">
              <SimulationControls
                request={request}
                onRequestChange={setRequest}
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={run}
                disabled={state.running}
                className={cn(
                  'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all',
                  state.running
                    ? 'border-slate-700/40 bg-slate-800/50 text-slate-500 cursor-wait'
                    : 'border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-200 hover:border-cyan-400/50 hover:shadow-[0_0_18px_rgba(34,211,238,0.25)]',
                )}
              >
                {state.running ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running…
                  </span>
                ) : (
                  'Run Simulation'
                )}
              </button>
              <button
                type="button"
                onClick={resetDefaults}
                disabled={state.running}
                className={cn(
                  'rounded-xl border border-slate-700/40 bg-slate-800/50 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-slate-600/60 hover:text-slate-200',
                  state.running && 'opacity-50 cursor-not-allowed',
                )}
              >
                Reset inputs
              </button>
            </div>
          </div>
        </div>

        {/* results */}
        <div className="lg:col-span-3 space-y-5">
          {state.error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
              {state.error}
            </div>
          )}

          {/* summary cards */}
          {state.result && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatBlock
                label="Expected Annual Loss"
                value={formatCurrency(state.result.expected_annual_loss_inr, { compact: false })}
                accent="cyan"
                sub={`P50 ${formatCurrency(state.result.p50_inr, { compact: true })}`}
              />
              <StatBlock
                label="P95 Worst Case"
                value={formatCurrency(state.result.p95_inr, { compact: false })}
                accent="rose"
                sub={`P10 ${formatCurrency(state.result.p10_inr, { compact: true })}`}
              />
              <StatBlock
                label="P10 Best Case"
                value={formatCurrency(state.result.p10_inr, { compact: false })}
                accent="green"
                sub={`P90 ${formatCurrency(state.result.p90_inr, { compact: true })}`}
              />
              <StatBlock
                label="Zero-Loss Share"
                value={`${(state.result.zero_loss_share * 100).toFixed(1)}%`}
                accent="blue"
                sub={`Mean event ₹${state.result.mean_event_severity_inr.toLocaleString('en-IN')}`}
              />
            </div>
          )}

          {/* distribution chart */}
          <div className="risk-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">
                Annual Loss Distribution
              </h2>
              <span className="text-[0.65rem] text-slate-500">
                {state.result ? `${state.result.iterations.toLocaleString('en-IN')} iterations` : ''}
              </span>
            </div>
            <DistributionChart result={state.result} loading={state.running} />
            {state.result && (
              <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] text-slate-500">
                {state.result.p10_inr != null && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                    P10 {formatCurrency(state.result.p10_inr, { compact: true, currency: false })}
                  </span>
                )}
                {state.result.p50_inr != null && (
                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-cyan-300">
                    P50 {formatCurrency(state.result.p50_inr, { compact: true, currency: false })}
                  </span>
                )}
                {state.result.p90_inr != null && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                    P90 {formatCurrency(state.result.p90_inr, { compact: true, currency: false })}
                  </span>
                )}
                {state.result.p95_inr != null && (
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
                    P95 {formatCurrency(state.result.p95_inr, { compact: true, currency: false })}
                  </span>
                )}
                {state.result.p99_inr != null && (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300">
                    P99 {formatCurrency(state.result.p99_inr, { compact: true, currency: false })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* assumptions footnote */}
          <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-3 text-xs text-slate-500">
            <span className="font-medium text-slate-400">Assumptions: </span>
            PERT severity (low/likely/high), Poisson event frequency, Binomial
            compromise probability, fixed seed ={' '}
            {request.seed ?? 20261027}. All inputs are editable and labeled; the
            backend returns a range (P50 / P95), never a single point estimate.
          </div>

          {/* top risks */}
          <div className="risk-panel p-5">
            <h2 className="text-sm font-medium text-slate-300">
              Top 5 Open Risks (from portfolio)
            </h2>
            <div className="mt-3">
              <TopRiskChips />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
