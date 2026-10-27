'use client';

import { useCallback, useState } from 'react';
import { api, type AiExplainResponseRuntime } from '@/lib';
import { cn, formatCurrencyCompact } from '@/lib/format';

/**
 * AI Copilot panel (build item 8).
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
      setError((err as Error).message || 'AI Copilot request failed');
      setPhase('error');
    }
  }, []);

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50">
      <div className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/70 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_10px_rgba(34,211,238,0.35)]">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </span>
          <h2 className="text-sm font-medium text-slate-300">AI Copilot</h2>
          {phase === 'ready' && result && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-widest',
                result.source === 'llm'
                  ? 'bg-cyan-500/10 text-cyan-300'
                  : 'bg-amber-500/10 text-amber-300',
              )}
            >
              {result.source === 'llm' ? 'LLM brief' : 'Deterministic fallback'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={phase === 'loading'}
          className={cn(
            'rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-all',
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
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">
              Generates an executive briefing from the current calculated risk
              metrics. Numbers come from the scoring, simulation and optimizer
              engines only.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
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
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                Fallback reason: {result.fallback_reason}
              </p>
            )}

            {/* the validated metrics block shown for transparency */}
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2">
                <div className="text-slate-500">Scenario asset</div>
                <div className="mt-0.5 font-semibold text-slate-200">
                  {result.metrics.scenario_asset_id || '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2">
                <div className="text-slate-500">Expected loss</div>
                <div className="mt-0.5 font-semibold tabular-nums text-cyan-200">
                  {formatCurrencyCompact(result.metrics.expected_annual_loss_inr)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2">
                <div className="text-slate-500">P50 / P95</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-200">
                  {formatCurrencyCompact(result.metrics.p50_inr, { currency: false })} /{' '}
                  {formatCurrencyCompact(result.metrics.p95_inr, { currency: false })}
                </div>
              </div>
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2">
                <div className="text-slate-500">Open findings</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-200">
                  {result.metrics.open_vulnerabilities}
                </div>
              </div>
            </div>

            <p className="text-[0.65rem] leading-5 text-slate-600">{result.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
