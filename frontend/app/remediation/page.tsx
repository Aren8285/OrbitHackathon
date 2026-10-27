'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, type Control as ControlItem, type Finding } from '@/lib';
import { cn, formatCurrency, formatCurrencyCompact } from '@/lib/format';

type RemediationState = {
  plan: Array<{ control: ControlItem; finding: Finding }>;
  selected: Array<string>;
  spending: number;
  loading: boolean;
  error: string | null;
  totalPlanCost: number;
  planCount: number;
};

export default function RemediationPage() {
  const [state, setState] = useState<RemediationState>({
    plan: [],
    selected: [],
    spending: 0,
    loading: true,
    error: null,
    totalPlanCost: 0,
    planCount: 0,
  });

  const fetchPlan = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [plan, controlsCost] = await Promise.all([
        api.remediation.plan(),
        api.controls.cost(),
      ]);
      const withCost = plan.map((item) => {
        const cost = controlsCost.find((c) => c.control_id === item.control.control_id);
        return { ...item, covered_cost: cost?.cost_inr ?? 0 };
      });
      const totalPlanCost = withCost.reduce((acc, i) => acc + i.covered_cost, 0);
      setState((s) => ({
        ...s,
        plan: withCost,
        totalPlanCost,
        planCount: withCost.length,
        spending: s.selected.reduce((acc, id) => {
          const item = withCost.find((i) => i.control.control_id === id);
          return acc + (item?.covered_cost ?? 0);
        }, 0),
        loading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as Error).message,
        plan: [],
        totalPlanCost: 0,
        planCount: 0,
      }));
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const toggle = useCallback((id: string) => {
    setState((s) => {
      const isSelected = s.selected.includes(id);
      const item = s.plan.find((i) => i.control.control_id === id);
      const cost = item?.covered_cost ?? 0;
      return {
        ...s,
        selected: isSelected
          ? s.selected.filter((x) => x !== id)
          : [...s.selected, id],
        spending: isSelected
          ? s.spending - cost
          : s.spending + cost,
      };
    });
  }, []);

  const progress = useMemo(
    () => (state.totalPlanCost > 0 ? (state.spending / state.totalPlanCost) * 100 : 0),
    [state.spending, state.totalPlanCost],
  );

  const SkeletonRow = () => (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-800/30 px-4 py-3">
      <div className="h-4 w-4 rounded-full skeleton" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-5 w-24 rounded skeleton" />
          <div className="h-4 w-40 rounded skeleton" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-32 rounded skeleton" />
          <div className="ml-auto h-3 w-16 rounded skeleton" />
        </div>
      </div>
    </div>
  );

  const EmptyPanel = () => (
    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 py-10">
      <svg className="h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">No remediation plan available yet.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* header */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Remediation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track execution of the prioritized remediation plan and control spend.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-4 py-2.5 text-center">
            <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
              Selected
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-cyan-200">
              {state.selected.length}
              {state.selected.length === 1 ? ' control' : ' controls'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-4 py-2.5 text-center">
            <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
              Spend
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-100">
              {formatCurrencyCompact(state.spending, { currency: false })}
              <span className="text-sm text-slate-500"> / </span>
              {formatCurrencyCompact(state.totalPlanCost, { currency: false })}
            </div>
          </div>
        </div>
      </div>

      {state.error && (
        <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
          {state.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* plan list */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50">
            <div className="border-b border-slate-700/40 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-300">
                  Remediation Plan
                </h2>
                {state.planCount > 0 && (
                  <span className="text-[0.65rem] text-slate-500">
                    {state.planCount} controls
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-700/30">
              {state.loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
              ) : state.plan.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyPanel />
                </div>
              ) : (
                state.plan.map((item) => (
                  <div
                    key={item.control.control_id}
                    className="flex items-center gap-3 rounded-lg border border-transparent px-4 py-3 transition-all hover:border-slate-700/40 hover:bg-slate-800/30"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(item.control.control_id)}
                      className={cn(
                        'h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all',
                        state.selected.includes(item.control.control_id)
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                          : 'border-slate-600/60 text-transparent hover:border-cyan-500/50',
                      )}
                    >
                      {state.selected.includes(item.control.control_id) && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-slate-200">
                        {item.control.control_name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{item.finding.cve_id}</span>
                        <span className="text-slate-600">·</span>
                        <span className="truncate">{item.finding.asset_name}</span>
                        {item.control.control_category && (
                          <>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-600">{item.control.control_category}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      <div className="text-sm font-medium tabular-nums text-slate-200">
                        {formatCurrencyCompact(item.covered_cost, { currency: false })}
                      </div>
                      <div className="text-[0.6rem] text-slate-500">cost</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* cost tracker */}
        <div className="space-y-5">
          {/* progress */}
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-slate-300">Cost tracker</h2>
              <span className="text-xs text-slate-500">
                {state.selected.length} of {state.planCount}
              </span>
            </div>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-slate-400">
                {state.selected.length > 0
                  ? `${formatCurrencyCompact(state.spending, { currency: false })} committed`
                  : 'No controls selected'}
              </span>
              <span className="tabular-nums text-cyan-200 font-medium">
                {progress.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500/80 to-blue-500/80 transition-all duration-500"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[0.6rem] text-slate-600">
              <span>{formatCurrencyCompact(0, { currency: false })}</span>
              <span>{formatCurrencyCompact(state.totalPlanCost, { currency: false })}</span>
            </div>
          </div>

          {/* summary */}
          {state.selected.length > 0 && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
              <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
                Selected controls
              </div>
              <div className="mt-2 space-y-2">
                {state.plan
                  .filter((i) => state.selected.includes(i.control.control_id))
                  .map((item) => (
                    <div
                      key={item.control.control_id}
                      className="flex items-center justify-between"
                    >
                      <span className="truncate text-sm text-slate-300">
                        {item.control.control_name}
                      </span>
                      <span className="ml-2 shrink-0 tabular-nums text-slate-400">
                        {formatCurrencyCompact(item.covered_cost, { currency: false })}
                      </span>
                    </div>
                  ))}
                <div className="mt-2 border-t border-slate-700/30 pt-2 flex items-center justify-between">
                  <span className="text-sm text-slate-400">Total</span>
                  <span className="text-sm font-semibold tabular-nums text-cyan-200">
                    {formatCurrencyCompact(state.spending, { currency: false })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* legend */}
          <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-3 text-xs text-slate-500">
            <span className="font-medium text-slate-400">Legend: </span>
            Check a control to track its execution. Spend and progress update as you
            select remediation actions for the open findings.
          </div>
        </div>
      </div>
    </div>
  );
}
