'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/format';

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

function formatINR(value: number, compact: boolean, currency: boolean): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let number: number;
  let suffix = '';
  if (abs >= 1_000_000_000) {
    number = abs / 1_000_000_000;
    suffix = 'B';
  } else if (abs >= 1_000_000) {
    number = abs / 1_000_000;
    suffix = 'M';
  } else if (abs >= 1_000) {
    number = abs / 1_000;
    suffix = 'K';
  } else {
    number = abs;
  }
  const label =
    currency ? '₹' : ''
    + (suffix ? (compact ? number.toFixed(1) : number.toFixed(0)) : number.toFixed(compact ? 1 : 0))
    + (suffix && !compact ? '' : '');
  return label + (suffix ? (compact ? '' : suffix) : '');
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const numericFormatter = inputFormat ?? ((v: number) => formatINR(v, compact, currency));

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const setFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      let x = clientX - rect.left;
      x = Math.max(0, Math.min(rect.width, x));
      const ratio = rect.width > 0 ? x / rect.width : 0;
      let v = min + ratio * (max - min);
      v = Math.max(min, Math.min(max, v));
      v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      onChange(v);
    },
    [min, max, step, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragging(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setFromPointer(e.clientX);
    },
    [disabled, setFromPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setFromPointer(e.clientX);
    },
    [dragging, setFromPointer],
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

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
        'space-y-3 rounded-xl border border-slate-700/40 bg-slate-900/50 p-4 transition-colors',
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

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative flex h-7 items-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="slider"
        aria-label={ariaLabel ?? label ?? 'Budget slider'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={numericFormatter(value)}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
          if (delta) {
            e.preventDefault();
            onChange(Math.max(min, Math.min(max, value + delta)));
          }
        }}
      >
        {/* filled track */}
        <div
          className={cn(
            'absolute left-0 right-0 h-1.5 rounded-full bg-slate-700/40 transition-all',
          )}
        >
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all',
              dragging && 'drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-cyan-300 bg-slate-900/80 cursor-grab transition-shadow',
            dragging && 'cursor-grabbing shadow-[0_0_12px_rgba(34,211,238,0.45)]',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
          style={{
            left: `calc(${pct}% - 12px)`,
            transform: dragging
              ? 'translate(-50%, -50%)'
              : 'translate(-50%, -50%) translateY(-50%)',
          }}
        >
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className={cn(
                'h-3 w-3 text-cyan-300 transition-transform',
                dragging && 'scale-110',
              )}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 14a4 4 0 110-8 4 4 0 010 8z" />
            </svg>
          </div>
        </div>

        {/* min / max labels */}
        <div className="pointer-events-none absolute left-0 top-3 text-[0.65rem] text-slate-500">
          {numericFormatter(min)}
        </div>
        <div className="pointer-events-none absolute right-0 top-3 text-[0.65rem] text-slate-500">
          {numericFormatter(max)}
        </div>
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
                'h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/70 px-7 pl-7 text-sm text-slate-100 placeholder-slate-500 tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40',
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
                'h-8 w-8 rounded-lg border border-slate-700/60 bg-slate-800/70 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300',
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
                'h-8 w-8 rounded-lg border border-slate-700/60 bg-slate-800/70 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300',
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
