import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

export default function Sparkline({ data, dataKey, color = '#00d4aa' }) {
  if (!data || data.length < 2) {
    return <span style={{ color: '#64748b', fontSize: '0.75rem' }}>onvoldoende data</span>;
  }

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
        <Tooltip
          contentStyle={{ background: '#141c2e', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
          formatter={(v) => [v?.toFixed(1), '']}
          labelFormatter={() => ''}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
