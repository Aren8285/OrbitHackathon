'use client';

import { useCallback, useState } from 'react';
import { FileText } from 'lucide-react';
import { api, type AiExplainResponseRuntime } from '@/lib';
import { cn, formatCurrencyCompact } from '@/lib/format';

/**
 * Risk explanation panel (build item 8).
 *
 * Security model: the browser never holds an LLM key; calling
 * GET /ai/explain returns server-written text built from a validated
 * calculated-metrics block only. The panel displays exactly what the server
 * produced - never numbers of its own.
 */

type Phase = 'idle' | 'loading' | 'ready' | 'error';

export default function CopilotPanel() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiExplainResponseRuntime | null>(null);

  const generate = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const data = await api.ai.explain();
      setResult(data);
      setPhase('ready');
    } catch (err) {
      setError((err as Error).message || 'Risk explanation request failed');
      setPhase('error');
    }
  }, []);

  return (
    <div className="risk-panel">
      <div className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/70 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <h2 className="text-sm font-medium text-slate-300">Risk explanation</h2>
          {phase === 'ready' && result && (
            <span
              className={cn(
                'risk-tag',
                result.source === 'llm'
                  ? 'bg-cyan-500/10 text-cyan-300'
                  : 'bg-slate-800 text-slate-300',
              )}
            >
              Model: {result.model === 'template' ? 'template' : result.model || 'template'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={phase === 'loading'}
          className={cn(
            'rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-all',
            phase === 'loading'
              ? 'cursor-wait opacity-60'
              : 'hover:border-cyan-400/50 hover:bg-cyan-500/20',
          )}
        >
          {phase === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border border-cyan-300/40 border-t-cyan-300" />
              Briefing…
            </span>
          ) : (
            phase === 'idle' ? 'Generate explanation' : 'Regenerate'
          )}
        </button>
      </div>

      <div className="p-5">
        {phase === 'idle' && (
          <div className="py-2">
            <p className="text-sm text-slate-500">
              Explain the current loss range and highest-priority findings.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
            {error}
            <button
              type="button"
              onClick={generate}
              className="ml-3 rounded-md border border-rose-400/30 px-2 py-0.5 text-xs text-rose-200 hover:bg-rose-500/10"
            >
              Retry
            </button>
          </div>
        )}

        {phase === 'ready' && result && (
          <div className="space-y-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-300">
              {result.explanation}
            </pre>

            {result.source !== 'llm' && result.fallback_reason && (
              <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                Fallback reason: {result.fallback_reason}
              </p>
            )}

            {/* the validated metrics block shown for transparency */}
            <div className="explanation-metrics kpi-strip text-xs">
              <div className="kpi-item">
                <div className="text-slate-500">Scenario asset</div>
                <div className="mt-0.5 font-semibold text-slate-200">
                  {result.metrics.scenario_asset_id || '—'}
                </div>
              </div>
              <div className="kpi-item">
                <div className="text-slate-500">Expected loss</div>
                <div className="mt-0.5 font-semibold tabular-nums text-cyan-200">
                  {formatCurrencyCompact(result.metrics.expected_annual_loss_inr)}
                </div>
              </div>
              <div className="kpi-item">
                <div className="text-slate-500">P50 / P95</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-200">
                  {formatCurrencyCompact(result.metrics.p50_inr, { currency: false })} /{' '}
                  {formatCurrencyCompact(result.metrics.p95_inr, { currency: false })}
                </div>
              </div>
              <div className="kpi-item">
                <div className="text-slate-500">Open findings</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-200">
                  {result.metrics.open_vulnerabilities}
                </div>
              </div>
            </div>

            <p className="text-xs leading-5 text-slate-500">{result.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
