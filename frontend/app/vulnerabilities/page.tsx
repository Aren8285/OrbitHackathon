'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VulnerabilityRuntime } from '@/lib';
import { api, mapApiError, formatNumber } from '@/lib';
import {
  cn,
  severityBadge,
  severityColor,
  severityDot,
  severityLevel,
} from '@/lib/format';

type Status = 'loading' | 'ready' | 'empty' | 'error';
type FilterState = { q: string; kev: '' | 'kev' | 'no-kev'; status: '' | 'open' | 'other' };
type SortKey = 'cve_id' | 'asset_id' | 'cvss_score' | 'epss_score' | 'patch_age_days';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

const PAGE_SIZE = 20;

function VulnerabilityRow({ vuln }: { vuln: VulnerabilityRuntime }) {
  const severity = severityLevel(vuln.cvss_score);
  return (
    <tr className="group transition-colors hover:bg-slate-800/30">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', severityDot(severity))} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-100">
                {vuln.cve_id}
              </span>
              {vuln.is_kev && <span className={severityBadge(severity)}>KEV</span>}
            </div>
            <div className="mt-0.5 max-w-[26rem] truncate text-xs text-slate-500">
              {vuln.title}
            </div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 font-mono text-sm text-slate-300">{vuln.asset_id}</td>
      <td className="px-5 py-3.5 text-right">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs tabular-nums',
            severityColor(severity),
          )}
        >
          {vuln.cvss_score.toFixed(1)}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-slate-300">
        {(vuln.epss_score * 100).toFixed(1)}%
      </td>
      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-slate-400">
        {vuln.patch_age_days.toLocaleString('en-IN')} d
      </td>
      <td className="px-5 py-3.5 text-right">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
            vuln.status === 'open'
              ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
              : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
          )}
        >
          {vuln.status}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            vuln.patch_available
              ? 'border border-cyan-500/20 bg-cyan-500/15 text-cyan-300'
              : 'border border-slate-700/40 bg-slate-800/60 text-slate-500',
          )}
        >
          {vuln.patch_available ? 'Patch available' : 'No patch'}
        </span>
      </td>
    </tr>
  );
}

export default function VulnerabilitiesPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [vulns, setVulns] = useState<VulnerabilityRuntime[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({ q: '', kev: '', status: '' });
  const [sort, setSort] = useState<SortState>({ key: 'cvss_score', dir: 'desc' });
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.vulnerabilities.list();
      setVulns(data);
      setStatus(data.length === 0 ? 'empty' : 'ready');
      setError(null);
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

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return vulns.filter((v) => {
      if (q && ![v.cve_id, v.asset_id, v.title].some((f) => f.toLowerCase().includes(q))) {
        return false;
      }
      if (filter.kev === 'kev' && !v.is_kev) return false;
      if (filter.kev === 'no-kev' && v.is_kev) return false;
      if (filter.status === 'open' && v.status !== 'open') return false;
      if (filter.status === 'other' && v.status === 'open') return false;
      return true;
    });
  }, [vulns, filter]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sort]);

  const stats = useMemo(() => {
    const kev = vulns.filter((v) => v.is_kev).length;
    const open = vulns.filter((v) => v.status === 'open').length;
    const worst = vulns.reduce(
      (max, v) => Math.max(max, v.cvss_score),
      0,
    );
    const avgCvss =
      vulns.length === 0
        ? 0
        : vulns.reduce((acc, v) => acc + v.cvss_score, 0) / vulns.length;
    return { kev, open, worst, avgCvss, total: vulns.length };
  }, [vulns]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages);
  const pageItems = sorted.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const handleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  const header = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="inline-flex items-center gap-1 uppercase tracking-widest transition-colors hover:text-cyan-300"
    >
      {label}
      {sort.key === key && <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* header + stats */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Vulnerabilities
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            CVEs recorded per asset. Widen the table on smaller screens by swiping
            horizontally.
          </p>
        </div>
      </div>

      {/* stats strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Total CVEs
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
            {formatNumber(stats.total)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Open
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-200">
            {formatNumber(stats.open)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            KEV listed
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-200">
            {formatNumber(stats.kev)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-4">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500">
            Worst CVSS
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-cyan-200">
            {stats.worst.toFixed(1)}
            <span className="ml-2 text-sm font-normal text-slate-500">
              avg {stats.avgCvss.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {status === 'error' && (
        <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
          {error}
          <button
            type="button"
            onClick={fetchData}
            className="ml-3 underline underline-offset-2 hover:text-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {status === 'empty' && (
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 px-5 py-10 text-center">
          <p className="text-sm text-slate-400">
            No vulnerabilities recorded yet — import a vulnerabilities CSV from{' '}
            <span className="font-mono text-cyan-300">/assets</span> or below.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <>
          {/* filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={filter.q}
              onChange={(e) => {
                setFilter((f) => ({ ...f, q: e.target.value }));
                setPage(1);
              }}
              placeholder="Search CVE, asset or title…"
              className="h-9 w-64 rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 text-sm text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
            />
            <div className="flex items-center gap-1.5">
              {[
                { value: '', label: 'All' },
                { value: 'kev', label: 'KEV only' },
                { value: 'no-kev', label: 'Non-KEV' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setFilter((f) => ({ ...f, kev: opt.value as FilterState['kev'] }));
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                    filter.kev === opt.value
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                      : 'border-slate-700/50 bg-slate-900/40 text-slate-400 hover:border-cyan-500/30 hover:text-cyan-200',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { value: '', label: 'Any status' },
                { value: 'open', label: 'Open' },
                { value: 'other', label: 'Closed' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setFilter((f) => ({ ...f, status: opt.value as FilterState['status'] }));
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                    filter.status === opt.value
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                      : 'border-slate-700/50 bg-slate-900/40 text-slate-400 hover:border-cyan-500/30 hover:text-cyan-200',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-slate-500">
              {total.toLocaleString('en-IN')} of {vulns.length.toLocaleString('en-IN')} CVEs
            </span>
          </div>

          {/* table */}
          <div className="overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem]">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-900/70">
                    <th className="px-5 py-3 text-left text-[0.65rem] font-medium uppercase text-slate-500">
                      {header('CVE', 'cve_id')}
                    </th>
                    <th className="px-5 py-3 text-left text-[0.65rem] font-medium uppercase text-slate-500">
                      {header('Asset', 'asset_id')}
                    </th>
                    <th className="px-5 py-3 text-right text-[0.65rem] font-medium uppercase text-slate-500">
                      {header('CVSS', 'cvss_score')}
                    </th>
                    <th className="px-5 py-3 text-right text-[0.65rem] font-medium uppercase text-slate-500">
                      {header('EPSS', 'epss_score')}
                    </th>
                    <th className="px-5 py-3 text-right text-[0.65rem] font-medium uppercase text-slate-500">
                      {header('Patch age', 'patch_age_days')}
                    </th>
                    <th className="px-5 py-3 text-right text-[0.65rem] font-medium uppercase text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-right text-[0.65rem] font-medium uppercase text-slate-500">
                      Patch
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {pageItems.map((v) => (
                    <VulnerabilityRow key={`${v.cve_id}-${v.asset_id}`} vuln={v} />
                  ))}
                </tbody>
              </table>
              {pageItems.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  No vulnerabilities match the current filters.
                </div>
              )}
            </div>

            {/* pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-700/40 bg-slate-900/70 px-5 py-2.5">
                <button
                  type="button"
                  onClick={() => setPage((x) => Math.max(1, x - 1))}
                  disabled={p <= 1}
                  className="rounded-lg border border-slate-700/50 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-200 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-slate-500">
                  Page {p} of {pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((x) => Math.min(pages, x + 1))}
                  disabled={p >= pages}
                  className="rounded-lg border border-slate-700/50 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
