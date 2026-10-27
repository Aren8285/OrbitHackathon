'use client';

import { useMemo, useState } from 'react';
import { assets, assumptions, mapApiError, type AssetRuntime } from '@/lib';
import { cn, formatCurrency, severityLevel, severityBadge, severityDot } from '@/lib/format';

type State = 'loading' | 'ready' | 'empty' | 'error';

export default function AssetTable() {
  const [state, setState] = useState<State>('loading');
  const [assetsList, setAssetsList] = useState<Array<AssetRuntime>>([]);
  const [assumptionsList, setAssumptionsList] = useState<
    Array<{
      asset_id: string;
      asset_name: string;
      assumed_impact_inr: number;
      is_assumption: boolean;
      basis: string;
      criticality: number;
    }>
  >([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [assetsData, assumptionsData] = await Promise.all([
        assets.list({ limit: 200 }),
        assumptions.list(),
      ]);
      setAssetsList(assetsData);
      setAssumptionsList(
        assumptionsData.map((a) => ({
          asset_id: a.asset_id,
          asset_name: a.asset_name,
          assumed_impact_inr: a.assumed_impact_inr,
          is_assumption: a.is_assumption,
          basis: a.basis,
          criticality: a.criticality,
        })),
      );
      setState('ready');
    } catch (err) {
      setError(mapApiError(err));
      setState('error');
    }
  };

  useState(() => {
    load();
  });

  const assumptionMap = useMemo(
    () =>
      new Map(
        assumptionsList.map((a) => [
          a.asset_id,
          a,
        ]),
      ),
    [assumptionsList],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return assetsList;
    return assetsList.filter(
      (a) =>
        a.asset_id.toLowerCase().includes(q) ||
        a.asset_name.toLowerCase().includes(q) ||
        (a.asset_type ?? '').toLowerCase().includes(q) ||
        (a.owner ?? '').toLowerCase().includes(q) ||
        (a.business_unit ?? '').toLowerCase().includes(q),
    );
  }, [assetsList, filter]);

  const assumedTotal = useMemo(
    () =>
      filtered.reduce((acc, a) => {
        const assumption = assumptionMap.get(a.asset_id);
        return acc + (assumption?.assumed_impact_inr ?? 0);
      }, 0),
    [filtered, assumptionMap],
  );

  const SkeletonRow = () => (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg skeleton" />
          <div className="space-y-1.5">
            <div className="h-4 w-32 rounded skeleton" />
            <div className="h-3 w-24 rounded skeleton" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-6 w-12 rounded skeleton" />
      </td>
      <td className="px-4 py-3">
        <div className="h-6 w-24 rounded skeleton" />
      </td>
      <td className="px-4 py-3">
        <div className="h-6 w-20 rounded skeleton" />
      </td>
      <td className="px-4 py-3">
        <div className="h-6 w-16 rounded skeleton" />
      </td>
    </tr>
  );

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
      <svg className="h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
      <p className="text-sm">No assets loaded yet.</p>
    </div>
  );

  const ErrorState = () => (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
      <svg className="h-10 w-10 text-rose-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-sm">Unable to load assets.</p>
      {error && <p className="text-xs text-slate-600">{error}</p>}
      <button
        type="button"
        onClick={load}
        className="mt-2 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-200"
      >
        Retry
      </button>
    </div>
  );

  const selected = filtered[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Assets</h1>
        <p className="mt-1 text-sm text-slate-500">
          Asset inventory with risk context from the backend.
        </p>
      </div>

      {/* controls */}
      <div className="mb-5 flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, ID, owner…"
            className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label="Clear filter"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {state === 'ready' && (
          <span className="text-sm text-slate-500">
            {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* table */}
      <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 overflow-hidden">
        <div className="border-b border-slate-700/40 bg-slate-900/70 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-300">Asset Inventory</h2>
        </div>

        {state === 'loading' && (
          <div className="divide-y divide-slate-700/30">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {state === 'error' && <ErrorState />}

        {state === 'empty' && <EmptyState />}

        {state === 'ready' && filtered.length === 0 && <EmptyState />}

        {state === 'ready' && filtered.length > 0 && (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/40">
                  <th className="w-[36%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Asset
                  </th>
                  <th className="w-[12%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Type
                  </th>
                  <th className="w-[14%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Criticality
                  </th>
                  <th className="w-[20%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Assumed Impact (INR)
                  </th>
                  <th className="w-[18%] px-5 py-3 text-right text-[0.65rem] uppercase tracking-widest text-slate-500">
                    Internet
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filtered.map((asset) => {
                  const assumption = assumptionMap.get(asset.asset_id);
                  const severity = severityLevel(asset.criticality / 10);
                  return (
                    <tr
                      key={asset.asset_id}
                      className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                      onClick={() => window.location.href = `/assets/${asset.asset_id}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/20 text-sm font-semibold text-cyan-200">
                            {asset.asset_id.split('-')[0]?.slice(0, 2) ?? '??'}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-200">
                              {asset.asset_name}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {asset.asset_id}
                              {asset.owner ? ` · ${asset.owner}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">
                        {asset.asset_type}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex h-2 w-2 rounded-full',
                            severityDot(severity),
                          )} />
                          <span className="text-sm font-medium text-slate-200">
                            {asset.criticality}/10
                          </span>
                          <span className={cn(
                            'rounded-full border px-1.5 py-0.5 text-[0.6rem] font-medium',
                            severityBadge(severity),
                          )}>
                            {severityLabel(severity)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-medium tabular-nums text-slate-200">
                            {formatCurrency(assumption?.assumed_impact_inr ?? 0, { currency: true })}
                          </span>
                          {assumption?.is_assumption ? (
                            <span className="ml-1 inline-flex h-4 items-center rounded-full bg-cyan-500/10 px-1.5 text-[0.55rem] uppercase tracking-wider text-cyan-300">
                              co
                            </span>
                          ) : null}
                        </div>
                        {assumption && (
                          <div className="truncate text-[0.6rem] text-slate-600">
                            {assumption.is_assumption ? 'editable assumption' : 'catalog baseline'}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            asset.internet_facing
                              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20'
                              : 'bg-slate-800/60 text-slate-500 border border-slate-700/40',
                          )}
                        >
                          {asset.internet_facing ? (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.068 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.068-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.402-3.113 1.157-4.418" />
                              </svg>
                              Yes
                            </>
                          ) : (
                            'Internal'
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* footer */}
            <div className="border-t border-slate-700/40 bg-slate-900/70 px-5 py-3 text-xs text-slate-500">
              {filtered.length} asset{filtered.length !== 1 ? 's' : ''} selected
              {assumedTotal > 0 && (
                <span className="ml-2 text-cyan-300">
                  · total assumed impact{' '}
                  {formatCurrency(assumedTotal, { currency: false })}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* selected-asset detail */}
      {selected && state === 'ready' && (
        <AssetDetailCard
          asset={selected}
          assumption={assumptionMap.get(selected.asset_id)}
        />
      )}
    </div>
  );
}

function AssetDetailCard({
  asset,
  assumption,
}: {
  asset: AssetRuntime;
  assumption:
    | {
        asset_id: string;
        asset_name: string;
        assumed_impact_inr: number;
        is_assumption: boolean;
        basis: string;
        criticality: number;
      }
    | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<unknown[] | null>(null);

  const loadChart = async () => {
    try {
      const data = await assets.list({ limit: 200 });
      const withRisk = data.map((a) => ({
        label: a.asset_name,
        value: a.criticality,
        id: a.asset_id,
      }));
      setChartData(withRisk);
      setLoaded(true);
    } catch (err) {
      setError(mapApiError(err));
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-slate-700/40 bg-slate-900/50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300">Asset detail</h2>
        <span className="text-[0.65rem] text-slate-500">{asset.asset_id}</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Criticality
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
            {asset.criticality}/10
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {asset.criticality >= 8
              ? 'High criticality asset'
              : asset.criticality >= 5
              ? 'Moderate criticality'
              : 'Lower criticality'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Data Classification
          </div>
          <div className="mt-1 text-lg font-medium text-slate-200">
            {asset.data_classification}
          </div>
          <div className="mt-1 text-xs text-slate-500">per asset record</div>
        </div>

        <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Revenue Dependency
          </div>
          <div className="mt-1 text-lg font-medium text-slate-200">
            {asset.revenue_dependency}/10
          </div>
          <div className="mt-1 text-xs text-slate-500">operational impact basis</div>
        </div>

        <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Assumed Impact
          </div>
          <div className="mt-1 text-lg font-medium tabular-nums text-cyan-200">
            {formatCurrency(assumption?.assumed_impact_inr ?? 0, { currency: false })}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {assumption?.is_assumption ? 'Editable assumption' : 'Catalog baseline'}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-700/30 bg-slate-800/40 p-4">
        <h3 className="text-sm font-medium text-slate-300">Risk by asset</h3>
        <p className="mt-1 text-xs text-slate-500">
          Criticality across the asset inventory (backend-derived).
        </p>
        <div className="mt-4 h-[220px]">
          {!loaded && !error && (
            <div className="flex items-center justify-center h-full text-sm text-slate-500">
              Loading chart…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-sm text-rose-300">
              {error}
            </div>
          )}
          {loaded && chartData && (
            <RiskByAssetBar
              data={chartData as Array<{ label: string; value: number; id: string }>}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RiskByAssetBar({
  data,
}: {
  data: Array<{ label: string; value: number; id: string }>;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="h-full flex flex-col justify-end">
      {data.map((d) => {
        const pct = Math.max(4, (d.value / max) * 100);
        return (
          <div key={d.id} className="mb-1.5 flex items-end gap-2">
            <span className="shrink-0 w-28 text-[0.6rem] text-slate-500 truncate">
              {d.label}
            </span>
            <div className="flex-1 h-6 overflow-hidden rounded bg-slate-800/60">
              <div
                className="h-full rounded bg-gradient-to-t from-cyan-500/80 to-blue-500/80 transition-all duration-700"
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-[0.6rem] tabular-nums text-slate-400 w-6 text-right">
              {d.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
