'use client';

/**
 * INR-aware formatting helpers.
 * All financial values flowing through the UI go through these so the team can
 * change magnitude handling in one place.
 */

export type CurrencyOpts = {
  /** Show ₹ symbol. Default true for INR finance contexts. */
  currency?: boolean;
  /** Compact magnitude labels (L / Cr) instead of full rupees. Default false. */
  compact?: boolean;
  /**
   * Minimum integer digits for the compact form.
   * compactMin=2 -> 1,20,000 shows as "1.20L" rather than "1.2L".
   */
  compactMin?: 0 | 1 | 2;
};

/**
 * Format an INR amount for display.
 *
 * Examples:
 *   formatCurrency(1250000)            -> "₹12,50,000"
 *   formatCurrency(1250000, {compact:"true})    -> "₹12.50L"
 *   formatCurrency(1250000, {currency:false})  -> "12,50,000"
 *   formatCurrency(0)                  -> "₹0"
 */
export function formatCurrency(
  value: number,
  opts: CurrencyOpts = {},
): string {
  const {
    currency = true,
    compact = false,
    compactMin = 0,
  } = opts;

  if (value == null || !Number.isFinite(value)) {
    return currency ? '₹—' : '—';
  }

  const raw = Math.round(Number(value));

  if (compact) {
    return formatCompact(raw, { currency, compactMin });
  }

  return (currency ? '₹' : '') + formatRupees(raw);
}

/**
 * Compact INR magnitude.
 *   1_50_000   -> "1.50L"   (compactMin=2)
 *   12_50_000  -> "12.5L"
 *   1_20_00_000 -> "1.20Cr"
 */
export function formatCurrencyCompact(
  value: number,
  opts: CurrencyOpts = {},
): string {
  return formatCurrency(value, { ...opts, compact: true });
}

function formatRupees(n: number): string {
  // Indian numbering: last 3 digits, then groups of 2 (1,71,90,000).
  const sign = n < 0 ? '-' : '';
  const s = String(Math.abs(n));
  const groups = [s.slice(-3)];
  let head = s.slice(0, -3);
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) groups.unshift(head);
  return sign + groups.join(',');
}

function formatCompact(n: number, { currency, compactMin }: { currency: boolean; compactMin: 0 | 1 | 2 }): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs >= 1_00_00_000) {
    const v = abs / 1_00_00_000;
    const formatted = formatDecimal(v, compactMin);
    return (currency ? '₹' : '') + sign + formatted + 'Cr';
  }
  if (abs >= 1_00_000) {
    const v = abs / 1_00_000;
    const formatted = formatDecimal(v, compactMin);
    return (currency ? '₹' : '') + sign + formatted + 'L';
  }
  return formatCurrency(abs, { currency });
}

function formatDecimal(v: number, minDigits: 0 | 1 | 2): string {
  if (minDigits === 0) {
    return String(Math.round(v));
  }
  const fixed = v.toFixed(minDigits);
  // strip trailing ".0" only when minDigits=1 and value is integer-ish
  if (minDigits === 1 && Number.isInteger(v)) {
    return String(v);
  }
  return fixed;
}

/**
 * Merge conditional class names (tiny clsx/tailwind-merge-free helper).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Format a plain number with thousands separators (Indian grouping).
 */
export function formatNumber(n: number, { currency = false, compact = false }: CurrencyOpts = {}): string {
  return formatCurrency(n, { currency, compact });
}

/**
 * Severity badge styles. Severity is the asset's labeled impact level, always
 * surfaced as a term plus the underlying number — never a fabricated label.
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export function severityLevel(value: number): SeverityLevel {
  if (value >= 0.75) return 'critical';
  if (value >= 0.5) return 'high';
  if (value >= 0.25) return 'medium';
  return 'low';
}

export function severityLabel(level: SeverityLevel): string {
  return {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  }[level];
}

export function severityColor(level: SeverityLevel): string {
  return {
    low: 'text-slate-400',
    medium: 'text-amber-300',
    high: 'text-orange-300',
    critical: 'text-rose-300',
  }[level];
}

export function severityBadge(level: SeverityLevel): string {
  return {
    low: 'bg-slate-500/15 text-slate-300',
    medium: 'bg-amber-500/15 text-amber-300',
    high: 'bg-orange-500/15 text-orange-300',
    critical: 'bg-rose-500/15 text-rose-300',
  }[level];
}

export function severityDot(level: SeverityLevel): string {
  return {
    low: 'bg-slate-400',
    medium: 'bg-amber-400',
    high: 'bg-orange-400',
    critical: 'bg-rose-400',
  }[level];
}

/** Priority (0..1) color chip. */
export function priorityColor(value: number): string {
  if (value >= 0.7) return 'bg-rose-500/20 text-rose-200 border-rose-500/30';
  if (value >= 0.4) return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
  return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
}

/** Compact control name for a table cell. */
export function controlShortName(name: string, max = 22): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}

/** Chart series key → label. */
export const chartSeriesLabel: Record<string, string> = {
  expected_annual_loss_inr: 'Expected Annual Loss',
  p50_inr: 'P50',
  p95_inr: 'P95',
  p99_inr: 'P99',
  max_annual_loss_inr: 'Worst Case',
};

/** Axis suffix for INR. */
export const inrSuffix = 'INR';

export const rupeeSymbol = '₹';
