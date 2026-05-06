import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const KLEUREN = ['#00d4aa', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

export default function BarChart({ data, xKey, yKey, color, height = 220, label = '' }) {
  if (!data || data.length === 0) {
    return <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>Geen data beschikbaar</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#141c2e', border: '1px solid #1e293b', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color: '#e2e8f0' }}
          formatter={(v) => [v != null ? Number(v).toFixed(1) : '—', label]}
        />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={color || KLEUREN[i % KLEUREN.length]} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
