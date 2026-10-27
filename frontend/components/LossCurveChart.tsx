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
import { cn } from '@/lib/format';

export default function LossCurveChart({
  data,
  p10,
  p25,
  p50,
  p75,
  p90,
  p95,
  p99,
  expected,
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
  const formatY = (v: number) => {
    // compact INR for the axis label
    if (v >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(1)}Cr`;
    if (v >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`;
    return `${Math.round(v).toLocaleString('en-IN')}`;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
      >
        <defs>
          <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="lossArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
          </linearGradient>
        </defs>

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
          formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Loss']}
          labelFormatter={(label) => `P${label}%`}
        />

        {/* percentile reference lines */}
        {p10 != null && (
          <ReferenceLine
            x={10}
            stroke="#34d399"
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: 'P10',
              position: 'top',
              fill: '#34d399',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p90 != null && (
          <ReferenceLine
            x={90}
            stroke="#fbbf24"
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: 'P90',
              position: 'top',
              fill: '#fbbf24',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p95 != null && (
          <ReferenceLine
            x={95}
            stroke="#fb7185"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: 'P95',
              position: 'top',
              fill: '#fb7185',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}
        {p99 != null && (
          <ReferenceLine
            x={99}
            stroke="#a78bfa"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{
              value: 'P99',
              position: 'top',
              fill: '#a78bfa',
              fontSize: 9,
              fontFamily: 'inherit',
            }}
          />
        )}

        {/* distribution area */}
        <Area
          type="monotone"
          dataKey="loss_inr"
          stroke="#22d3ee"
          strokeWidth={1.4}
          strokeOpacity={0.85}
          fill="url(#lossGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
