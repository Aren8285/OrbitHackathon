/**
 * Chart color constants for SVG-graphic channels (Recharts `fill`/`stroke`
 * attributes) where CSS `var()` references cannot be used as attribute values.
 *
 * Every constant is the exact current value of the design token named in the
 * comment in `app/globals.css`. If you change a token there, update the
 * corresponding constant here in the same change — TS keeps them from drifting.
 */

export const ACCENT = '#9cb7ca'; // var(--accent)
export const ACCENT_SOFT = '#25333e'; // var(--accent-soft)
export const INK_PRIMARY = '#e6e8ea'; // var(--ink-primary)
export const INK_SECONDARY = '#bcc3ca'; // var(--ink-secondary)
export const INK_MUTED = '#8f9aa5'; // var(--ink-muted)
export const INK_FAINT = '#8f9aa5'; // var(--ink-faint)
export const HAIRLINE = '#303740'; // var(--hairline)
export const HAIRLINE_STRONG = '#48525d'; // var(--hairline-strong)
export const NEUTRAL_600 = '#65707a'; // tailwind gray-600 (neutral ramp)
export const NEUTRAL_400 = '#9aa4ad'; // tailwind gray-400 (neutral ramp)
export const SEVERITY_ROSE = '#ce918b'; // var(--severity-rose)
export const SEVERITY_AMBER = '#c4ad7d'; // var(--severity-amber)
export const SEVERITY_EMERALD = '#a1b89e'; // var(--severity-emerald)
