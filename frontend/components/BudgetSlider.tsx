'use client';

import { useCallback } from 'react';
import { cn, formatCurrencyCompact } from '@/lib/format';

type BudgetSliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
  currency?: boolean;
  compact?: boolean;
  className?: string;
  showInputs?: boolean;
  inputFormat?: (value: number) => string;
  disabled?: boolean;
  ariaLabel?: string;
};

function formatINR(value: number, _compact: boolean, currency: boolean): string {
  return formatCurrencyCompact(value, { currency, compactMin: 2 });
}

export default function BudgetSlider({
  min = 0,
  max = 1_000_000,
  step = 10_000,
  value,
  onChange,
  label,
  currency = true,
  compact = false,
  className,
  showInputs = false,
  inputFormat,
  disabled = false,
  ariaLabel,
}: BudgetSliderProps) {
  const numericFormatter = inputFormat ?? ((v: number) => formatINR(v, compact, currency));

  const onChangeNumeric = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.max(min, Math.min(max, raw));
      const stepped = Math.round(clamped / step) * step;
      onChange(Math.max(min, Math.min(max, stepped)));
    },
    [min, max, step, onChange],
  );

  return (
    <div
      className={cn(
        'space-y-3 rounded-md border border-slate-700/40 bg-slate-900/50 p-4 transition-colors',
        className,
      )}
    >
      {/* Header */}
      {(label || showInputs) && (
        <div className="flex items-center justify-between">
          {label && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">{label}</span>
              {currency && (
                <span className="text-slate-500">INR</span>
              )}
            </div>
          )}
          {!showInputs && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-lg font-semibold tabular-nums transition-colors',
                  currency ? 'text-cyan-200' : 'text-slate-100',
                )}
              >
                {numericFormatter(value)}
              </span>
            </div>
          )}
        </div>
      )}

      <input type="range" min={min} max={max} step={step} value={value}
        onChange={onChangeNumeric} disabled={disabled}
        aria-label={ariaLabel ?? label ?? 'Budget slider'} aria-valuetext={numericFormatter(value)}
        className="block w-full cursor-pointer accent-cyan-400 disabled:opacity-50" />
      <div className="flex justify-between text-xs text-slate-400">
        <span>{numericFormatter(min)}</span><span>{numericFormatter(max)}</span>
      </div>

      {/* Numeric inputs when enabled */}
      {showInputs && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
              ₹
            </span>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={onChangeNumeric}
              className={cn(
                'h-8 w-full rounded-md border border-slate-700/60 bg-slate-800/70 px-7 pl-7 text-sm text-slate-100 placeholder-slate-500 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              disabled={disabled}
              aria-label="Budget value"
            />
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={cn(
                'h-8 w-8 rounded-md border border-slate-700/60 bg-slate-800/70 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              onClick={() => onChange(Math.max(min, value - step))}
              disabled={disabled}
              aria-label="Decrease budget"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
            <button
              type="button"
              className={cn(
                'h-8 w-8 rounded-md border border-slate-700/60 bg-slate-800/70 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              onClick={() => onChange(Math.min(max, value + step))}
              disabled={disabled}
              aria-label="Increase budget"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function formatBudgetLabel(value: number, compact = false): string {
  return formatINR(value, compact, true);
}
