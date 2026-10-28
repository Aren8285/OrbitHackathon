'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { cn, formatCurrencyCompact } from '@/lib/format';
import {
  ACCENT,
  ACCENT_SOFT,
  INK_MUTED,
  INK_PRIMARY,
  INK_SECONDARY,
  NEUTRAL_400,
  SEVERITY_AMBER,
  SEVERITY_EMERALD,
  SEVERITY_ROSE,
} from '@/lib/chart-colors';

export default function LossCurveChart({
  data,
  p10,
  p50,
  p90,
  p95,
  p99,
  className,
}: {
  data: Array<{ percent: number; loss_inr: number }>;
  p10?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  p95?: number | null;
  p99?: number | null;
  expected?: number | null;
  className?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('h-full flex items-center justify-center text-sm text-slate-500', className)}>
        No distribution data
      </div>
    );
  }

  const formatX = (v: number) => `${v.toFixed(0)}%`;
  const formatY = (v: number) => formatCurrencyCompact(v);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
      >


        <XAxis
          dataKey="percent"
          type="number"
          domain={[0, 100]}
          tickFormatter={formatX}
          tick={{ fill: INK_MUTED, fontSize: 12, fontFamily: 'inherit' }}
          axisLine={{ stroke: 'rgba(143,154,165,0.15)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />

        <YAxis
          tickFormatter={formatY}
          tick={{ fill: INK_MUTED, fontSize: 12, fontFamily: 'inherit' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--surface-panel)',
            border: '1px solid var(--hairline-strong)',
            borderRadius: 4,
            fontFamily: 'var(--font-mono), monospace',
            fontSize: 12,
            color: INK_PRIMARY,
          }}
          labelStyle={{ color: INK_MUTED }}
          formatter={(value: number) => [formatCurrencyCompact(value), 'Loss']}
          labelFormatter={(label) => `P${label}%`}
        />

        {/* percentile reference lines */}
        {p10 != null && (
          <ReferenceLine
            x={10}
            stroke={SEVERITY_EMERALD}
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: 'P10',
              position: 'top',
              fill: SEVERITY_EMERALD,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p90 != null && (
          <ReferenceLine
            x={90}
            stroke={SEVERITY_AMBER}
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: 'P90',
              position: 'top',
              fill: SEVERITY_AMBER,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p50 != null && <ReferenceLine x={50} stroke={INK_SECONDARY} strokeDasharray="3 3" label={{value:'P50',position:'insideTopRight',fill:INK_SECONDARY,fontSize:12}} />}
        {p95 != null && (
          <ReferenceLine
            x={95}
            stroke={SEVERITY_ROSE}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: 'P95',
              position: 'top',
              fill: SEVERITY_ROSE,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p99 != null && (
          <ReferenceLine
            x={99}
            stroke={NEUTRAL_400}
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{
              value: 'P99',
              position: 'top',
              fill: NEUTRAL_400,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
        )}

        {/* distribution area */}
        <Area isAnimationActive={false}
          type="monotone"
          dataKey="loss_inr"
          stroke={ACCENT}
          strokeWidth={1.4}
          strokeOpacity={0.85}
          fill={ACCENT_SOFT}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
