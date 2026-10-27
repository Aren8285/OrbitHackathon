'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  api,
  type Control as ControlItem,
  type Finding,
  type RemediationImpactRuntime,
  type RemediationTaskRuntime,
  type RemediationTaskStatus,
} from '@/lib';
import { cn, formatCurrencyCompact } from '@/lib/format';

type PlanItem = {
  control: ControlItem;
  finding: Finding;
  covered_cost: number;
};

const STATUS_ORDER: RemediationTaskStatus[] = ['planned', 'completed', 'verified'];

const STATUS_META: Record<RemediationTaskStatus, { label: string; note: string; styling: string }> = {
  planned: {
    label: 'Planned',
    note: 'Planned change — no risk credit',
    styling: 'text-slate-300',
  },
  completed: {
    label: 'Completed',
    note: 'Implemented, not verified — no risk credit yet',
    styling: 'text-amber-300',
  },
  verified: {
    label: 'Verified',
    note: 'Implemented AND verified — counts toward achieved risk',
    styling: 'text-emerald-300',
  },
};

type RemediationState = {
  plan: PlanItem[];
  selected: Array<string>;
  spending: number;
  tasks: Record<string, RemediationTaskRuntime>;
  impact: RemediationImpactRuntime | null;
  loading: boolean;
  mutating: string | null;
  error: string | null;
  totalPlanCost: number;
  planCount: number;
};

const INITIAL: RemediationState = {
  plan: [],
  selected: [],
  spending: 0,
  tasks: {},
  impact: null,
  loading: true,
  mutating: null,
  error: null,
  totalPlanCost: 0,
  planCount: 0,
};

export default function RemediationPage() {
  const [state, setState] = useState<RemediationState>(INITIAL);

  const fetchPlan = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [plan, controlsCost, tasks, impact] = await Promise.all([
        api.remediation.plan(),
        api.controls.cost(),
        api.remediation.tasks(),
        api.remediation.impact().catch(() => null), // impact stays optional
      ]);
      const withCost = plan.map((item) => {
        const cost = controlsCost.find((c) => c.control_id === item.control.control_id);
        return { ...item, covered_cost: cost?.cost_inr ?? 0 };
      });
      const taskMap: Record<string, RemediationTaskRuntime> = {};
      for (const task of tasks) taskMap[task.control_key] = task;
      // controls on the plan always show their persisted status
      for (const item of withCost) {
        if (!taskMap[item.control.control_id]) {
          taskMap[item.control.control_id] = {
            control_key: item.control.control_id,
            control_name: item.control.control_name,
            category: item.control.category ?? '',
            status: 'planned',
            cost_inr: item.covered_cost,
            effectiveness: 0,
            counts_toward_achieved_risk: false,
            updated_at: null,
          };
        }
      }
      setState((s) => ({
        ...s,
        plan: withCost,
        tasks: taskMap,
        impact,
        totalPlanCost: withCost.reduce((acc, i) => acc + i.covered_cost, 0),
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
        selected: isSelected ? s.selected.filter((x) => x !== id) : [...s.selected, id],
        spending: isSelected ? s.spending - cost : s.spending + cost,
      };
    });
  }, []);

  /** Persist a status change; the response refreshes the task map in place. */
  const updateStatus = useCallback(async (controlKey: string, status: RemediationTaskStatus) => {
    setState((s) => ({ ...s, mutating: controlKey, error: null }));
    try {
      const updated = await api.remediation.updateTask(controlKey, status);
      setState((s) => ({ ...s, tasks: { ...s.tasks, [controlKey]: updated }, mutating: null }));
      // statuses changed -> achieved-risk recalculation comes from the server
      const impact = await api.remediation.impact().catch(() => null);
      setState((s) => ({ ...s, impact }));
    } catch (err) {
      setState((s) => ({
        ...s,
        mutating: null,
        error: (err as Error).message || 'Status update failed',
      }));
    }
  }, []);

  const statusCounts = useMemo(() => {
    const counts: Record<RemediationTaskStatus, number> = { planned: 0, completed: 0, verified: 0 };
    for (const task of Object.values(state.tasks)) counts[task.status] += 1;
    return counts;
  }, [state.tasks]);

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
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
      <svg className="h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">No remediation plan available yet.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Remediation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track execution of the prioritized plan. Only VERIFIED controls reduce residual risk.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-4 py-2.5 text-center"
            >
              <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
                {STATUS_META[status].label}
              </div>
              <div
                className={cn(
                  'mt-0.5 text-xl font-semibold tabular-nums',
                  STATUS_META[status].styling,
                )}
              >
                {statusCounts[status]}
              </div>
            </div>
          ))}
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
                <h2 className="text-sm font-medium text-slate-300">Remediation Plan</h2>
                {state.planCount > 0 && (
                  <span className="text-[0.65rem] text-slate-500">{state.planCount} controls</span>
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
                state.plan.map((item) => {
                  const key = item.control.control_id;
                  const task = state.tasks[key];
                  const status: RemediationTaskStatus = task?.status ?? 'planned';
                  const meta = STATUS_META[status];
                  return (
                    <div
                      key={key}
                      className="flex flex-col gap-2 rounded-lg border border-transparent px-4 py-3 transition-all hover:border-slate-700/40 hover:bg-slate-800/30 sm:flex-row sm:items-center"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-label={`Toggle tracking for ${item.control.control_name}`}
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                          state.selected.includes(key)
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                            : 'border-slate-600/60 text-transparent hover:border-cyan-500/50',
                        )}
                      >
                        {state.selected.includes(key) && (
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
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
                              <span>{item.control.control_category}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium tabular-nums text-slate-200">
                          {formatCurrencyCompact(item.covered_cost, { currency: false })}
                        </div>
                        <div className="text-[0.6rem] text-slate-500">cost/yr</div>
                      </div>
                      {/* persisted status control */}
                      <div className="shrink-0 sm:ml-3">
                        <select
                          value={status}
                          disabled={state.mutating === key}
                          onChange={(e) => updateStatus(key, e.target.value as RemediationTaskStatus)}
                          title={STATUS_META[status].note}
                          className={cn(
                            'w-full cursor-pointer rounded-md border bg-slate-800/70 px-2 py-1 text-xs font-medium outline-none transition-colors sm:w-auto',
                            state.mutating === key
                              ? 'border-slate-600/60 opacity-60'
                              : 'border-slate-700/60 hover:border-cyan-500/40',
                            meta.styling,
                          )}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s} className="bg-slate-900 text-slate-200">
                              {STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* right column */}
        <div className="space-y-5">
          {/* achieved-risk recalculation (verification-aware) */}
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">Achieved risk</h2>
              {state.impact && (
                <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[0.6rem] text-slate-500">
                  scenario {state.impact.asset_id || '—'}
                </span>
              )}
            </div>

            {!state.impact && !state.loading && (
              <p className="py-2 text-center text-xs text-slate-500">
                No impact data available yet.
              </p>
            )}

            {state.impact && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <div className="text-slate-500">Before · verified ONLY</div>
                    <div className="mt-1 font-semibold tabular-nums text-slate-200">
                      {formatCurrencyCompact(state.impact.before.expected_annual_loss_inr)}
                    </div>
                    <div className="mt-1 text-[0.65rem] text-slate-500">
                      P50 {formatCurrencyCompact(state.impact.before.p50_inr, { currency: false })}
                      {' / '}
                      P95 {formatCurrencyCompact(state.impact.before.p95_inr, { currency: false })}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <div className="text-slate-500">
                      After · verified ONLY
                    </div>
                    <div className="mt-1 font-semibold tabular-nums text-emerald-200">
                      {formatCurrencyCompact(state.impact.after.expected_annual_loss_inr)}
                    </div>
                    <div className="mt-1 text-[0.65rem] text-slate-500">
                      P50 {formatCurrencyCompact(state.impact.after.p50_inr, { currency: false })}
                      {' / '}
                      P95 {formatCurrencyCompact(state.impact.after.p95_inr, { currency: false })}
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between rounded-lg bg-emerald-500/5 px-3 py-2 text-xs">
                  <span className="text-slate-400">Expected annual reduction</span>
                  <span className="font-semibold tabular-nums text-emerald-200">
                    {formatCurrencyCompact(state.impact.expected_reduction_inr)}
                  </span>
                </div>
                <div className="space-y-1 text-[0.65rem] text-slate-600">
                  <p>
                    Verified combined effectiveness:{' '}
                    <span className="text-slate-400">
                      {(state.impact.combined_effectiveness * 100).toFixed(1)}%
                    </span>
                  </p>
                  <p>
                    Completed-but-unverified ({(state.impact.excluded_completed_effectiveness * 100).toFixed(1)}%)
                    excluded from risk credit until verified.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* cost tracker */}
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
              <span className="font-medium tabular-nums text-cyan-200">{progress.toFixed(0)}%</span>
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

          {/* selected summary */}
          {state.selected.length > 0 && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
              <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
                Selected controls
              </div>
              <div className="mt-2 space-y-2">
                {state.plan
                  .filter((i) => state.selected.includes(i.control.control_id))
                  .map((item) => (
                    <div key={item.control.control_id} className="flex items-center justify-between">
                      <span className="truncate text-sm text-slate-300">
                        {item.control.control_name}
                      </span>
                      <span className="ml-2 shrink-0 tabular-nums text-slate-400">
                        {formatCurrencyCompact(item.covered_cost, { currency: false })}
                      </span>
                    </div>
                  ))}
                <div className="mt-2 flex items-center justify-between border-t border-slate-700/30 pt-2">
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
            <span className="font-medium text-slate-400">Legend: </span>statuses persist on the
            server. Planned/completed give no risk credit; verified controls recalculate residual
            risk immediately.
          </div>
        </div>
      </div>
    </div>
  );
}
