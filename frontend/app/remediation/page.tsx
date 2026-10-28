'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type RemediationTaskRuntime, type RemediationTaskStatus, type RemediationImpactRuntime } from '@/lib';
import { formatCurrencyCompact, priorityColor } from '@/lib/format';

const money = (value: number) => formatCurrencyCompact(value, {compactMin: 2});

const statuses: RemediationTaskStatus[] = ['open','in_progress','completed','verified'];
const labels = {open:'Open',in_progress:'In progress',completed:'Completed',verified:'Verified'};

export default function RemediationPage() {
  const [tasks,setTasks] = useState<RemediationTaskRuntime[]>([]);
  const [impact,setImpact] = useState<RemediationImpactRuntime | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [saving,setSaving] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rows, values] = await Promise.all([api.remediation.tasks(),api.remediation.impact()]);
      setTasks(rows); setImpact(values);
    } catch(e) {setError((e as Error).message);}
    finally {setLoading(false);}
  },[]);
  useEffect(() => {void Promise.resolve().then(load);},[load]);
  const update = async (task: RemediationTaskRuntime, status: RemediationTaskStatus, coverage?:number) => {
    setSaving(String(task.id ?? task.control_key)); setError(null);
    try {await api.remediation.updateTask(task.control_key,status,coverage,task.id); await load();}
    catch(e) {setError((e as Error).message);}
    finally {setSaving(null);}
  };
  return <div className="mx-auto max-w-[1440px] space-y-6 px-6 py-6">
    <div className="flex justify-between"><h1 className="text-2xl font-semibold">Remediation</h1><button onClick={() => void load()}>Refresh</button></div>
    <p className="text-sm text-slate-400">Track controls by status, owner and due date. Risk reduction is counted after verification. Individual reduction estimates overlap.</p>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {loading && <p role="status">Loading remediation tasks...</p>}
    {!loading && !error && tasks.length===0 && <p>No tasks yet. Import data and run risk calculation.</p>}
    {!loading && !error && impact && <div className="kpi-strip kpi-strip-two">
      {([['Before verification',impact.before],['Current implemented risk',impact.after]] as const).map(([label,value]) => <div key={label} className="kpi-item">
        <p className="kpi-label">{label}</p><p className="kpi-value text-xl">{money(value.expected_annual_loss_inr)}</p><p className="kpi-detail">Expected annual loss</p>
        <p className="text-sm">P50 {money(value.p50_inr)} / P95 {money(value.p95_inr)}</p>
      </div>)}
    </div>}
    {!loading && !error && tasks.length > 0 && <div className="remediation-register">{statuses.map(status => <section key={status} className="risk-panel">
      <h2>{labels[status]} ({tasks.filter(task => task.status===status).length})</h2>
      <div className="table-scroll"><table><thead><tr><th>Priority</th><th>Control / finding</th><th>Owner</th><th>Due date</th><th className="numeric">Estimated reduction</th><th className="numeric">Coverage %</th><th>Status</th></tr></thead><tbody>
      {tasks.filter(task => task.status===status).map(task => <tr key={task.id ?? task.control_key}>
        <td><span className={priorityColor(task.priority)}>{task.priority}</span></td>
        <td><div className="font-medium">{task.control_name}</div><div className="risk-id mt-1 text-slate-400">{task.asset_id} / finding {task.vulnerability_id ?? 'not specified'}</div></td>
        <td>{task.owner}</td><td className="risk-id whitespace-nowrap">{task.due_date}</td>
        <td className="numeric">{money(task.estimated_risk_reduction)}</td>
        <td className="numeric"><input aria-label={`Coverage for task ${task.id ?? task.control_key}`} className="w-16 rounded bg-slate-800 p-1 text-right font-mono" type="number" min={0} max={100}
            key={`${task.id}-${task.coverage}`} defaultValue={task.coverage*100} disabled={saving!==null}
            onBlur={e => {const value=Number(e.target.value); if(Number.isFinite(value)&&value/100!==task.coverage) void update(task,task.status,Math.max(0,Math.min(1,value/100)));}}/></td>
        <td><select aria-label={`Status for task ${task.id ?? task.control_key}`} className="w-32 rounded bg-slate-800 p-2" value={task.status} disabled={saving!==null}
          onChange={e => void update(task,e.target.value as RemediationTaskStatus)}>
          {statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}
        </select></td>
      </tr>)}</tbody></table></div>
    </section>)}</div>}
  </div>;
}
