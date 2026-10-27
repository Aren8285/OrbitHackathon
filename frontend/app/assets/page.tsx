'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssetRuntime,
  ImpactAssumptionRuntime,
  AssetCreateRuntime,
} from '@/lib';
import {
  assets,
  assumptions,
  mapApiError,
  formatCurrency,
  severityLevel,
  severityBadge,
  severityDot,
  severityLabel,
} from '@/lib';
import { cn } from '@/lib/format';

type SortKey = keyof Pick<AssetRuntime, 'asset_name' | 'criticality' | 'asset_type'>;
type SortDir = 'asc' | 'desc';
type Status = 'loading' | 'ready' | 'empty' | 'error';

type SortState = {
  key: SortKey;
  dir: SortDir;
};

type FilterState = {
  q: string;
  type: string;
  env: string;
  internet: string;
};

const ASSET_TYPES = ['Database', 'Web App', 'API', 'Endpoint', 'Cloud', 'Server', 'SaaS', 'Network'];
const ENVIRONMENTS = ['Production', 'Staging', 'Development'];

function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td className="px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg skeleton" />
              <div className="space-y-1.5">
                <div className="h-4 w-40 rounded skeleton" />
                <div className="h-3 w-24 rounded skeleton" />
              </div>
            </div>
          </td>
          <td className="px-5 py-3.5">
            <div className="h-4 w-20 rounded skeleton" />
          </td>
          <td className="px-5 py-3.5">
            <div className="h-5 w-12 rounded skeleton" />
          </td>
          <td className="px-5 py-3.5">
            <div className="h-4 w-24 rounded skeleton" />
          </td>
          <td className="px-5 py-3.5">
            <div className="h-4 w-10 rounded skeleton" />
          </td>
        </tr>
      ))}
    </>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <svg className="h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
      <p className="text-sm">No assets loaded yet.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-200"
      >
        Retry
      </button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <svg className="h-10 w-10 text-rose-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-sm text-rose-200">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-200"
      >
        Retry
      </button>
    </div>
  );
}

function AssetImportCard({
  onImportStart,
  importing,
  error,
  onClearError,
  accepting,
}: {
  onImportStart: (file: File) => void;
  importing: boolean;
  error: string | null;
  onClearError: () => void;
  accepting: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragged, setDragged] = useState(false);

  const acceptCsv = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) return false;
    if (file.size > 2 * 1024 * 1024) return false;
    return true;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!acceptCsv(file)) return;
      onImportStart(file);
    },
    [onImportStart, acceptCsv],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragged(false);
      if (!accepting) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [accepting, handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (accepting) setDragged(true);
  }, [accepting]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragged(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-800/40 p-5 text-sm text-slate-400">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-slate-300">Import assets via CSV</span>
        {accepting && (
          <span className="text-[0.6rem] uppercase tracking-wider text-cyan-400">
            ready
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Drops acceptance.csv from RiskOps backend /imports/assets.
        Max 2MB, .csv only.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          {error}
          <button
            type="button"
            onClick={onClearError}
            className="ml-2 text-rose-400 hover:text-rose-200"
          >
            dismiss
          </button>
        </div>
      )}

      {importing ? (
        <div className="flex items-center gap-3">
          <svg className="h-4 w-4 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs text-slate-400">Importing…</span>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-3 text-xs text-slate-400 cursor-pointer transition-all hover:border-cyan-500/40 hover:bg-slate-800/60 hover:text-slate-200',
            dragged && 'border-cyan-500/60 bg-cyan-500/5',
            !accepting && 'opacity-50 cursor-not-allowed',
          )}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span>Click or drop a CSV here</span>
          <span className="ml-auto text-[0.55rem] uppercase tracking-wider text-slate-600">
            assets.csv
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
            disabled={!accepting}
          />
        </div>
      )}
    </div>
  );
}

function AssetRow({
  asset,
  assumption,
}: {
  asset: AssetRuntime;
  assumption: ImpactAssumptionRuntime | undefined;
}) {
  const severity = severityLevel(asset.criticality / 10);
  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/20 text-sm font-semibold text-cyan-200">
            {asset.asset_id.split('-')[0]?.slice(0, 2) ?? '??'}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-200">{asset.asset_name}</div>
            <div className="truncate text-xs text-slate-500">{asset.asset_id}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 text-sm text-slate-400">{asset.asset_type}</td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex h-2 w-2 rounded-full', severityDot(severity))} />
          <span className="text-sm font-medium text-slate-200">{asset.criticality}/10</span>
          <span className={cn('rounded-full border px-1.5 py-0.5 text-[0.6rem] font-medium', severityBadge(severity))}>
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
          {asset.internet_facing ? 'Internet' : 'Internal'}
        </span>
      </td>
    </tr>
  );
}

export default function AssetsPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [assetsList, setAssetsList] = useState<AssetRuntime[]>([]);
  const [assumptionsList, setAssumptionsList] = useState<ImpactAssumptionRuntime[]>([]);
  const [filter, setFilter] = useState<FilterState>({ q: '', type: '', env: '', internet: '' });
  const [sort, setSort] = useState<SortState>({ key: 'asset_name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [assetsData, assumptionsData] = await Promise.all([
        assets.list({ limit: 1000 }),
        assumptions.list(),
      ]);
      setAssetsList(assetsData);
      setAssumptionsList(assumptionsData);
      setStatus(assetsData.length === 0 ? 'empty' : 'ready');
      setError(null);
    } catch (err) {
      setError(mapApiError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assumptionMap = useMemo(
    () => new Map(assumptionsList.map((a) => [a.asset_id, a])),
    [assumptionsList],
  );

  const importStart = useCallback(async (file: File) => {
    setImporting(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/imports/assets`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        let detail = `Import failed: ${response.status}`;
        try {
          const body = (await response.json()) as { detail?: unknown };
          detail = body.detail ? String(body.detail) : detail;
        } catch {
          /* keep status message */
        }
        throw new Error(detail);
      }
      await fetchData();
    } catch (err) {
      setImportError(mapApiError(err));
    } finally {
      setImporting(false);
    }
  }, [fetchData]);

  const importAccepting = true; // backend always accepts valid .csv up to 2MB

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return assetsList.filter((a) => {
      if (q && ![
        a.asset_id,
        a.asset_name,
        a.asset_type,
        a.owner ?? '',
        a.business_unit ?? '',
      ].some((f) => f.toLowerCase().includes(q))) {
        return false;
      }
      if (filter.type && a.asset_type !== filter.type) return false;
      if (filter.env && a.environment !== filter.env) return false;
      if (filter.internet && (filter.internet === 'internet' ? a.internet_facing : !a.internet_facing)) {
        return false;
      }
      return true;
    });
  }, [assetsList, filter]);

  const sorted = useMemo(() => {
    const [key, dir] = [sort.key, sort.dir];
    const sorted = [...filtered].sort((a, b) => {
      const av = a[key] as string | number;
      const bv = b[key] as string | number;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filtered, sort]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages);
  const pageItems = sorted.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    setSort((s) => ({
      key,
      dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const currentPage = page;
  const displayedItems = pageItems.map((a) => (
    <AssetRow key={a.asset_id} asset={a} assumption={assumptionMap.get(a.asset_id)} />
  ));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Assets</h1>
          <p className="mt-1 text-sm text-slate-500">Asset inventory with import and filtering.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{total} assets</span>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={filter.q}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search assets…"
            className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
          />
          {filter.q && (
            <button
              type="button"
              onClick={() => setFilter((f) => ({ ...f, q: '' }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label="Clear search"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={filter.type}
          onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
          className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        >
          <option value="">All types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={filter.env}
          onChange={(e) => setFilter((f) => ({ ...f, env: e.target.value }))}
          className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        >
          <option value="">All environments</option>
          {ENVIRONMENTS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <select
          value={filter.internet}
          onChange={(e) => setFilter((f) => ({ ...f, internet: e.target.value }))}
          className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        >
          <option value="">All exposure</option>
          <option value="internet">Internet-facing</option>
          <option value="internal">Internal</option>
        </select>

        {(filter.q || filter.type || filter.env || filter.internet) && (
          <button
            type="button"
            onClick={() => setFilter({ q: '', type: '', env: '', internet: '' })}
            className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 overflow-hidden">
        <div className="border-b border-slate-700/40 bg-slate-900/70 px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Asset Inventory</h2>
          <AssetImportCard
            onImportStart={importStart}
            importing={importing}
            error={importError}
            onClearError={() => setImportError(null)}
            accepting={importAccepting}
          />
        </div>

        {status === 'loading' && (
          <div className="divide-y divide-slate-700/30">
            <SkeletonRow />
          </div>
        )}

        {status === 'error' && (
          <ErrorState message={error ?? 'Unknown error'} onRetry={fetchData} />
        )}

        {status === 'empty' && <EmptyState onRetry={fetchData} />}

        {status === 'ready' && (
          <>
            {total === 0 ? (
              <EmptyState onRetry={fetchData} />
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/40">
                      <th className="w-[36%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                        <button
                          type="button"
                          onClick={() => handleSort('asset_name')}
                          className="flex items-center gap-1 hover:text-slate-200"
                        >
                          Asset
                          {sort.key === 'asset_name' && (
                            <svg className={cn('h-3 w-3', sort.dir === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      </th>
                      <th className="w-[12%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                        <button
                          type="button"
                          onClick={() => handleSort('asset_type')}
                          className="flex items-center gap-1 hover:text-slate-200"
                        >
                          Type
                          {sort.key === 'asset_type' && (
                            <svg className={cn('h-3 w-3', sort.dir === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      </th>
                      <th className="w-[14%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                        <button
                          type="button"
                          onClick={() => handleSort('criticality')}
                          className="flex items-center gap-1 hover:text-slate-200"
                        >
                          Criticality
                          {sort.key === 'criticality' && (
                            <svg className={cn('h-3 w-3', sort.dir === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      </th>
                      <th className="w-[20%] px-5 py-3 text-left text-[0.65rem] uppercase tracking-widest text-slate-500">
                        Assumed Impact (INR)
                      </th>
                      <th className="w-[18%] px-5 py-3 text-right text-[0.65rem] uppercase tracking-widest text-slate-500">
                        Exposure
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {displayedItems}
                  </tbody>
                </table>

                {total > PAGE_SIZE && (
                  <div className="border-t border-slate-700/40 bg-slate-900/70 px-5 py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {total} asset{total !== 1 ? 's' : ''}
                      {filter.q || filter.type || filter.env || filter.internet ? ' (filtered)' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-xs text-slate-500">
                        {currentPage} / {pages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        disabled={currentPage >= pages}
                        className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="mt-4 text-[0.6rem] text-slate-600">
        Import reads the same columns the app uses: asset_id, asset_name, asset_type, environment,
        owner, business_unit, criticality, data_classification, internet_facing,
        revenue_dependency, operational_impact, compliance_impact.
      </div>
    </div>
  );
}
