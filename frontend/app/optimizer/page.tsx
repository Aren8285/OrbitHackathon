'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, type Recommendation, type OptimizerRecommendationRequest } from '@/lib';
import { cn, formatCurrency, formatCurrencyCompact } from '@/lib/format';

type OptimizerState = {
  recommendations: Array<Recommendation>;
  running: boolean;
  error: string | null;
};

export default function BudgetOptimizerPage() {
  const [state, setState] = useState<OptimizerState>({
    recommendations: [],
    running: false,
    error: null,
  });
  const [budget, setBudget] = useState(2_000_000);
  const [assetId, setAssetId] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    if (!assetId) {
      setState((s) => ({ ...s, recommendations: [], error: null }));
      return;
    }
    setState((s) => ({ ...s, running: true, error: null }));
    try {
      const payload: OptimizerRecommendationRequest = {
        budget_inr: budget,
        asset_id: assetId,
      };
      const data = await api.optimizer.list(payload);
      setState({ recommendations: data, running: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        error: (err as Error).message,
      }));
    }
  }, [assetId, budget]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const totalCost = useMemo(
    () => state.recommendations.reduce((acc, r) => acc + r.cost_inr, 0),
    [state.recommendations],
  );

  const totalBenefit = useMemo(
    () => state.recommendations.reduce((acc, r) => acc + r.residual_loss_reduction_inr, 0),
    [state.recommendations],
  );

  const coverage = useMemo(
    () => {
      const selected = state.recommendations;
      if (selected.length === 0) return 0;
      return 1 - selected.reduce((acc, r) => acc * (1 - r.effectiveness), 1);
    },
    [state.recommendations],
  );

  const coveragePct = (coverage * 100).toFixed(1);

  const SkeletonTable = () => (
    <table>
      <thead>
        <tr>
          <th>Control</th>
          <th className="text-right">Cost</th>
          <th className="text-right">Top per ₹</th>
          <th className="text-right">Residual reduction</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 4 }).map((_, i) => (
          <tr key={i}>
            <td>
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full skeleton" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-40 skeleton" />
                  <div className="h-2.5 w-28 skeleton" />
                </div>
              </div>
            </td>
            <td className="text-right">
              <div className="h-4 w-16 skeleton" />
            </td>
            <td className="text-right">
              <div className="h-4 w-14 skeleton" />
            </td>
            <td className="text-right">
              <div className="h-4 w-20 skeleton" />
            </td>
            <td className="text-right">
              <div className="h-7 w-16 skeleton" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          Budget Optimizer
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Greedy control selection ranked by expected loss reduction per rupee.
          Recommendations recompute after every selection.
        </p>
      </div>

      {/* controls bar */}
      <div className="mb-6 rounded-2xl border border-slate-700/40 bg-slate-900/50 p-5">
        <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-5">
          {/* asset selector */}
          <div className="w-64">
            <label className="mb-1.5 block text-sm text-slate-400">Asset</label>
            <AssetSelector
              value={assetId}
              onChange={setAssetId}
              disabled={state.running}
              onClear={() => {
                setAssetId(null);
                fetchRecommendations();
              }}
            />
          </div>

          {/* budget slider */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-slate-400">Budget (INR)</span>
              <span className="text-cyan-200 font-medium tabular-nums">
                {formatCurrencyCompact(budget, { currency: false })}
              </span>
            </div>
            <BudgetSlider
              value={budget}
              min={500_000}
              max={50_000_000}
              step={100_000}
              onChange={(v) => setBudget(v)}
              disabled={state.running}
              labelLow="₹1L"
              labelHigh="₹5Cr"
            />
            <div className="mt-2 flex justify-between text-[0.6rem] text-slate-600">
              <span>₹1,00,000</span>
              <span>₹5,00,00,000</span>
            </div>
          </div>

          {/* quick presets */}
          <div className="shrink-0">
            <div className="mb-1.5 text-sm text-slate-400">Quick budget</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '₹25L', value: 2_500_000 },
                { label: '₹50L', value: 5_000_000 },
                { label: '₹1Cr', value: 10_000_000 },
                { label: '₹5Cr', value: 50_000_000 },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setBudget(preset.value)}
                  disabled={state.running}
                  className={cn(
                    'rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-slate-800 hover:text-cyan-200',
                    budget === preset.value && 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200',
                    state.running && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {state.error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200">
            {state.error}
          </div>
        )}

        {!assetId && !state.error && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-700/30 bg-slate-800/30 p-3 text-sm text-slate-400">
            <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Select an asset above to see control recommendations for it.
          </div>
        )}
      </div>

      {/* summary strip */}
      {state.recommendations.length > 0 && (
        <div className="mb-6 grid gap-4 grid-cols-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
            <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
              Selected Controls
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
              {state.recommendations.length}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
            <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
              Total Spend (INR)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-cyan-200">
              {formatCurrencyCompact(totalCost, { currency: false })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
            <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
              Residual Loss Reduction
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">
              {formatCurrencyCompact(totalBenefit, { currency: false })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
            <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
              Combined Effectiveness
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-blue-200">
              {coveragePct}%
            </div>
          </div>
        </div>
      )}

      {/* table */}
      <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 overflow-hidden">
        <div className="border-b border-slate-700/40 bg-slate-900/70 px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">
              {state.recommendations.length > 0 ? 'Recommended Controls' : 'No Controls'}
            </h2>
            {state.recommendations.length > 0 && (
              <span className="text-[0.65rem] text-slate-500">
                recalculated after each selection
              </span>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-700/30">
          {state.running ? (
            <SkeletonTable />
          ) : state.recommendations.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              {assetId
                ? 'No controls available for this asset within the budget.'
                : 'Select an asset to get started.'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/40">
                  <th className="w-[54%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Control
                  </th>
                  <th className="w-[11%] px-5 py-3 text-right text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Cost (INR)
                  </th>
                  <th className="w-[11%] px-5 py-3 text-right text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Benefit / ₹
                  </th>
                  <th className="w-[11%] px-5 py-3 text-right text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Residual reduction (INR)
                  </th>
                  <th className="w-[13%] px-5 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {state.recommendations.map((rec) => (
                  <tr key={rec.control_id} className="hover:bg-slate-800/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-200">
                          {rec.priority_rank}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-200">
                            {rec.control_name}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {rec.rationale}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-slate-300">
                      {formatCurrencyCompact(rec.cost_inr, { currency: false })}
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-blue-200">
                      {rec.benefit_per_rupee != null
                        ? rec.benefit_per_rupee
                            .toFixed(2)
                            .replace('.', ',')
                        : '—'}
                      <span className="text-[0.6rem] text-slate-500"> loss/₹</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm tabular-nums text-emerald-200">
                      {formatCurrencyCompact(rec.residual_loss_reduction_inr, { currency: false })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="mb-1 flex items-center justify-end gap-1">
                        <span className="text-[0.6rem] text-slate-500">
                          eff {rec.effectiveness * 100}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-700/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500/70 to-blue-500/70 transition-all duration-500"
                          style={{ width: `${Math.min(100, rec.effectiveness * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* footer summary */}
        {state.recommendations.length > 0 && (
          <div className="border-t border-slate-700/40 bg-slate-900/70 px-5 py-3 text-xs text-slate-500">
            <span className="text-slate-400">Combined effectiveness: </span>
            {coveragePct}%
            {' '}
            <span className="text-slate-400">·</span>
            {' '}
            <span className="text-slate-400">Spend: </span>
            {formatCurrencyCompact(totalCost, { currency: false })}
            {' '}
            <span className="text-slate-400">/</span>
            {' '}
            {formatCurrencyCompact(budget, { currency: false })}
            {' '}
            budget
          </div>
        )}
      </div>

      {/* formula note */}
      <div className="mt-4 rounded-xl border border-slate-700/30 bg-slate-800/30 p-3 text-xs text-slate-500">
        <span className="font-medium text-slate-400">Method: </span>
        Marginal expected loss reduction per rupee, recalculated after each pick.
        Combined effectiveness = 1 − ∏(1 − effectivenessᵢ).
      </div>
    </div>
  );
}

function AssetSelector({
  value,
  onChange,
  disabled,
  onClear,
}: {
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  onClear: () => void;
}) {
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const inputRef = useState<HTMLInputElement | null>(null)[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOptions([]);
    const run = async () => {
      try {
        const data = await api.assets.list(200);
        if (!cancelled) setOptions(data.map((a) => ({ id: a.asset_id, name: a.asset_name })));
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())),
    [options, q],
  );

  const selectedName = useMemo(
    () => options.find((o) => o.id === value)?.name ?? '',
    [options, value],
  );

  useEffect(() => {
    if (inputRef && !inputRef.value) {
      // focus on mount
    }
  }, []);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm text-slate-400">Asset</label>
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClear();
          }}
          disabled={disabled}
          className={cn(
            'flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/40 bg-slate-800/70 px-3 py-2 text-sm',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span className="truncate text-slate-200">{selectedName}</span>
          <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            inputRef?.focus();
          }}
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-slate-700/60 bg-slate-800/30 px-3 py-2 text-sm text-slate-500',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <svg className="h-4 w-4 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Select asset…
        </button>
      )}

      {/* dropdown */}
      {options.length > 0 && (
        <div
          className={cn(
            'absolute right-0 z-20 mt-1 w-full rounded-lg border border-slate-700/60 bg-slate-800/95 p-1 shadow-lg backdrop-blur-sm',
            !value && 'hidden',
          )}
        >
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter assets…"
              disabled={disabled}
              className={cn(
                'h-8 w-full rounded border border-slate-700/60 bg-slate-900/70 px-2.5 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
          </div>

          {loading ? (
            <div className="py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5">
                  <div className="h-4 w-4 rounded-full skeleton" />
                  <div className="h-3 w-32 skeleton" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-2 text-xs text-rose-300">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-2 text-xs text-slate-500">No matching assets.</div>
          ) : (
            <ul className="max-h-56 overflow-auto">
              {filtered.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setQ('');
                    }}
                    disabled={disabled}
                    className={cn(
                      'flex w-full items-center gap-2 px-2 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700/50',
                      opt.id === value && 'text-cyan-200 bg-cyan-500/5 rounded',
                      disabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className="truncate">{opt.name}</span>
                    <span className="ml-auto text-[0.6rem] uppercase tracking-wider text-slate-600">
                      {opt.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
