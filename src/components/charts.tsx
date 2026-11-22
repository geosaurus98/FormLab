import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, ComposedChart, Legend } from 'recharts';
import type { ReactNode } from 'react';

/** Consistent chart palette (validated for contrast on light and dark backgrounds). */
export const SERIES = { primary: '#0d9488', secondary: '#6366f1', tertiary: '#d97706', muted: '#94a3b8', danger: '#dc2626' };

const axis = { fontSize: 11, fill: '#64748b' };

export function InsufficientData({ children, height = 180 }: { children: ReactNode; height?: number }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-500 dark:border-slate-700" style={{ height }}>
      {children}
    </div>
  );
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  dots?: boolean;
}

export function TrendLine({ data, xKey, series, height = 220, refY, refLabel, yDomain, yUnit }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; refY?: number | null; refLabel?: string; yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax']; yUnit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={axis} tickLine={false} axisLine={false} domain={yDomain ?? ['auto', 'auto']} unit={yUnit} width={52} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {refY != null && <ReferenceLine y={refY} stroke={SERIES.muted} strokeDasharray="4 4" label={{ value: refLabel, fontSize: 11, fill: '#64748b', position: 'insideTopRight' }} />}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={s.dots ? { r: 2.5 } : false} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, xKey, series, height = 200, refY, refLabel, stacked }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; refY?: number | null; refLabel?: string; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} minTickGap={12} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={52} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {refY != null && <ReferenceLine y={refY} stroke={SERIES.danger} strokeDasharray="4 4" label={{ value: refLabel, fontSize: 11, fill: '#64748b', position: 'insideTopRight' }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} stackId={stacked ? 'a' : undefined} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BarsWithLine({ data, xKey, bar, line, height = 220, sharedAxis = false }: { data: Record<string, unknown>[]; xKey: string; bar: SeriesDef; line: SeriesDef; height?: number; sharedAxis?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} minTickGap={12} />
        <YAxis yAxisId="l" tick={axis} tickLine={false} axisLine={false} width={52} />
        {!sharedAxis && <YAxis yAxisId="r" orientation="right" tick={axis} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />}
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="l" dataKey={bar.key} name={bar.label} fill={bar.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line yAxisId={sharedAxis ? 'l' : 'r'} type={sharedAxis ? 'stepAfter' : 'monotone'} dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2} strokeDasharray={sharedAxis ? '5 4' : undefined} dot={sharedAxis ? false : { r: 3 }} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const shortDate = (key: string) => {
  const [, m, d] = key.slice(0, 10).split('-');
  return `${Number(d)}/${Number(m)}`;
};
