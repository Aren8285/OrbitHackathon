'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { vulnerabilities, mapApiError, type AssetRuntime, type VulnerabilityRuntime } from '@/lib';
import { priorityColor } from '@/lib/format';

export default function AssetDetails({ asset, onClose }: { asset: AssetRuntime; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<VulnerabilityRuntime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const findings = await vulnerabilities.list();
      setRows(findings.filter(finding => finding.asset_id === asset.asset_id));
    } catch (err) { setError(mapApiError(err)); }
    finally { setLoading(false); }
  }, [asset.asset_id]);
  useEffect(() => {
    dialog.current?.showModal();
    void Promise.resolve().then(load);
  }, [load]);
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="asset-detail-title"
    className="m-auto max-h-[85vh] w-[min(90vw,800px)] overflow-y-auto rounded-md border border-slate-700 bg-slate-900 p-6 text-slate-100 backdrop:bg-black/70">
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="asset-detail-title" className="text-xl font-semibold">{asset.asset_name}</h2>
        <p className="mt-1 text-sm text-slate-400">{asset.asset_id} · {asset.asset_type} · {asset.environment}</p></div>
      <button type="button" onClick={() => dialog.current?.close()} className="rounded border border-slate-600 px-3 py-1">Close</button>
    </div>
    <p className="mt-4 text-sm">Owner: {asset.owner || 'Unassigned'} · {asset.internet_facing ? 'Internet-facing' : 'Internal'} · Criticality {asset.criticality}/10</p>
    <h3 className="mt-6 mb-3 font-semibold">Vulnerabilities</h3>
    {loading && <p role="status">Loading vulnerabilities...</p>}
    {error && <div role="alert"><p className="text-rose-300">{error}</p><button onClick={() => void load()} className="mt-2 underline">Retry</button></div>}
    {!loading && !error && rows.length === 0 && <p className="text-slate-400">No vulnerabilities found for this asset.</p>}
    {!loading && !error && rows.length > 0 && <div className="space-y-3">{rows.map(row => <article key={row.id} className="border-b border-slate-700 py-3">
      <div className="flex flex-wrap gap-2"><span className={`rounded px-2 ${priorityColor(row.priority_label)}`}>{row.priority_label}</span>
        <strong className="risk-id">{row.cve_id}</strong>{row.is_kev && <span className="risk-tag kev-tag">KEV</span>}</div>
      <p className="mt-2">{row.title}</p><p className="mt-1 text-xs text-slate-400">CVSS {row.cvss_score.toFixed(1)} · EPSS {(row.epss_score * 100).toFixed(1)}% · {row.status}</p>
    </article>)}</div>}
  </dialog>;
}
