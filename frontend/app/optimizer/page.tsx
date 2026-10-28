'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { api, mapApiError, type AssetRuntime, type Control, type OptimizerRecommendationRuntime } from '@/lib';
import { formatCurrencyCompact } from '@/lib/format';
import { ACCENT, INK_SECONDARY } from '@/lib/chart-colors';

const money = (value: number) => formatCurrencyCompact(value, {compactMin: 2});
import BudgetSlider from '@/components/BudgetSlider';
import { OPTIMIZER_MIN_BUDGET, OPTIMIZER_MAX_BUDGET, OPTIMIZER_DEBOUNCE_MS, toggleConstraint } from '@/lib/view-model';

export default function BudgetOptimizerPage() {
  const [budget, setBudget] = useState(2_000_000);
  const [required, setRequired] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [assetId, setAssetId] = useState('');
  const [assets, setAssets] = useState<AssetRuntime[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [controls, setControls] = useState<Control[]>([]);
  const [result, setResult] = useState<OptimizerRecommendationRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true); setCatalogError(null);
    try {
      const [catalog, inventory] = await Promise.all([api.controls.list(), api.assets.list()]);
      setControls(catalog); setAssets(inventory);
    } catch (err) { setCatalogError(mapApiError(err)); }
    finally { setCatalogLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadCatalog); }, [loadCatalog]);
  useEffect(() => {
    if (catalogLoading || catalogError || assets.length === 0 || controls.length === 0) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const data = await api.optimizer.full({budget_inr: budget, must_include: required, exclude: excluded, asset_id: assetId || undefined});
        if (active) setResult(data);
      } catch (e) { if (active) { setError(mapApiError(e)); setResult(null); } }
      finally { if (active) setLoading(false); }
    }, OPTIMIZER_DEBOUNCE_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [budget, required, excluded, assetId, catalogLoading, catalogError, assets.length, controls.length]);
  const invalidate = () => { setLoading(true); setResult(null); setError(null); };
  const selectedAsset = assets.find(asset => asset.asset_id === assetId);
  const noScenarioNotice = selectedAsset?.coverage === 'none' || Boolean(result?.warning);
  const chartTooltip = {borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono), monospace'};
  const change = (key: string, mode: 'required' | 'excluded') => {
    invalidate();
    const next = toggleConstraint(required, excluded, key, mode);
    setRequired(next.required); setExcluded(next.excluded);
  };
  return <div className="mx-auto max-w-[1440px] space-y-6 px-6 py-6">
    <h1 className="text-2xl font-semibold">Budget optimizer</h1>
    <p className="text-sm text-slate-400">Choose controls within the annual budget. Results compare current coverage with a proposed full rollout.</p>
    {catalogLoading && <p role="status">Loading assets and controls...</p>}
    {catalogError && <div role="alert"><p className="text-rose-300">{catalogError}</p><button className="mt-2 underline" onClick={() => void loadCatalog()}>Retry</button></div>}
    {!catalogLoading && !catalogError && (assets.length === 0 || controls.length === 0) && <p>No data to optimize yet. Load the FinPay demo from the dashboard to get started.</p>}
    {!catalogLoading && !catalogError && assets.length > 0 && controls.length > 0 && <div className="risk-panel p-5">
      <label className="mb-4 block text-sm">Asset
        <select aria-label="Asset" value={assetId} onChange={event => { invalidate(); setAssetId(event.target.value); }}
          className="mt-2 block w-full rounded-md border border-slate-600 bg-slate-900 p-3 text-slate-100">
          <option value="">All assets (portfolio)</option>
          {assets.map(asset => <option key={asset.asset_id} value={asset.asset_id}>{asset.asset_name} ({asset.asset_id})</option>)}
        </select>
      </label>
      {selectedAsset?.coverage === 'none' && <p role="status" className="mb-4 border-l-2 border-amber-500 px-3 py-2 text-sm text-amber-300">No scenario linked, so loss is not modelled for this asset</p>}
      <p className="mb-3">Budget: {money(budget)}</p>
      <BudgetSlider value={budget} min={OPTIMIZER_MIN_BUDGET} max={OPTIMIZER_MAX_BUDGET} step={100_000} onChange={value => { if (value !== budget) { invalidate(); setBudget(value); } }} />
      <div className="control-constraints">
        {controls.map(control => <div key={control.control_id} className="constraint-row text-sm">
          <p><span>{control.control_name}</span><span className="money text-slate-400">{money(control.cost_inr)}</span></p>
          <div className="contents">
            <label className="flex items-center gap-2"><input type="checkbox" aria-label={`Must-have ${control.control_name}`} checked={required.includes(control.control_id)}
              onChange={() => change(control.control_id, 'required')} />Must-have</label>
            <label className="flex items-center gap-2"><input type="checkbox" aria-label={`Exclude ${control.control_name}`} checked={excluded.includes(control.control_id)}
              onChange={() => change(control.control_id, 'excluded')} />Exclude</label>
          </div>
        </div>)}
      </div>
    </div>}
    {!catalogLoading && !catalogError && assets.length > 0 && controls.length > 0 && loading && <p role="status">Calculating recommendations...</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {!loading && !catalogLoading && !catalogError && result && !noScenarioNotice && <>
      <div className="kpi-strip">
        {[
          ['Total cost', money(result.total_cost)],
          ['Expected loss before', money(result.expected_loss_before)],
          ['Expected loss after', money(result.expected_loss_after)],
          ['Reduction / ROI', `${result.percent_reduction.toFixed(1)}% / ${result.roi == null ? 'N/A (zero cost)' : (result.roi * 100).toFixed(1) + '%'}`],
        ].map(([label,value]) => <div key={label} className="kpi-item"><p className="kpi-label">{label}</p><p className="kpi-value text-xl">{value}</p></div>)}
      </div>
      <div className="risk-panel h-64 p-4"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={[{name:'Before', loss:result.expected_loss_before/100000},{name:'Proposed',loss:result.expected_loss_after/100000}]}>
          <XAxis dataKey="name" tick={{fontSize: 12}}/><YAxis tick={{fontSize: 12}} label={{value:'INR lakh',angle:-90,position:'insideLeft',fontSize:12}}/><Tooltip contentStyle={chartTooltip} formatter={value => [money(Number(value) * 100000), "Expected annual loss"]}/><Bar isAnimationActive={false} dataKey="loss" fill={ACCENT}><LabelList dataKey="loss" position="top" formatter={(value: unknown) => money(Number(value) * 100000)} fill={INK_SECONDARY} fontSize={12} /></Bar>
        </BarChart>
      </ResponsiveContainer></div>
      <div className="risk-panel p-5">
        <h2 className="mb-3 font-semibold">Selected controls</h2>
        {result.recommended_controls.length === 0 && <p>No affordable control with positive marginal benefit remains.</p>}
        <div className="table-scroll"><table><thead><tr><th>Control</th><th className="numeric">Annual cost</th><th className="numeric">Loss reduction</th></tr></thead><tbody>
        {result.recommended_controls.map(control => <tr key={control.control_key}>
          <td>{control.control_name}</td><td className="numeric">{money(control.annual_cost_inr)}</td><td className="numeric">{money(control.marginal_benefit_inr)}</td>
        </tr>)}
        </tbody></table></div>
      </div>
    </>}
  </div>;
}
