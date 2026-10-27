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
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'inherit' }}
          axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />

        <YAxis
          tickFormatter={formatY}
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'inherit' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(20,33,62,0.92)',
            border: '1px solid rgba(34,211,238,0.18)',
            borderRadius: 8,
            fontSize: 11,
            color: '#e2e8f0',
          }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number) => [formatCurrencyCompact(value), 'Loss']}
          labelFormatter={(label) => `P${label}%`}
        />

        {/* percentile reference lines */}
        {p10 != null && (
          <ReferenceLine
            x={10}
            stroke="#a1b89e"
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: 'P10',
              position: 'top',
              fill: '#a1b89e',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p90 != null && (
          <ReferenceLine
            x={90}
            stroke="#c4ad7d"
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: 'P90',
              position: 'top',
              fill: '#c4ad7d',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p50 != null && <ReferenceLine x={50} stroke="#bcc3ca" strokeDasharray="3 3" label={{value:'P50',position:'insideTopRight',fill:'#bcc3ca',fontSize:12}} />}
        {p95 != null && (
          <ReferenceLine
            x={95}
            stroke="#ce918b"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: 'P95',
              position: 'top',
              fill: '#ce918b',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p99 != null && (
          <ReferenceLine
            x={99}
            stroke="#9aa4ad"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{
              value: 'P99',
              position: 'top',
              fill: '#9aa4ad',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}

        {/* distribution area */}
        <Area isAnimationActive={false}
          type="monotone"
          dataKey="loss_inr"
          stroke="#9cb7ca"
          strokeWidth={1.4}
          strokeOpacity={0.85}
          fill="#25333e"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
