import React, { useEffect, useState } from 'react';
import { api } from '../api';
import BarChart from '../components/BarChart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const styles = `
  .page-title { font-family: 'DM Serif Display', serif; font-size: 1.8rem; color: #e2e8f0; margin-bottom: 4px; }
  .page-subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 28px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .stat-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 22px; }
  .stat-label { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .stat-value { font-size: 1.8rem; font-weight: 700; color: #e2e8f0; }
  .stat-unit { font-size: 0.85rem; color: #64748b; margin-left: 3px; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 24px; }
  .chart-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px 24px; }
  .chart-card-full { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px 24px; margin-bottom: 18px; }
  .card-title { font-size: 0.82rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
  @media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
`;

function fmt(v, d = 1) { return v != null ? Number(v).toFixed(d) : '—'; }

export default function Statistieken() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.statistieken().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#64748b', padding: 40 }}>Laden...</div>;

  const herstelCurve = (stats?.herstelCurve || []).filter(r => r.week_na_operatie != null);
  const gemPerFase = stats?.gemPerFase || [];
  const faseData = gemPerFase.map(f => ({ fase: f.fase, kracht: Number(f.gem_kracht || 0).toFixed(1), pijn: Number(f.gem_pijn || 0).toFixed(1) }));

  return (
    <>
      <style>{styles}</style>
      <h1 className="page-title">Statistieken</h1>
      <p className="page-subtitle">Database-brede gemiddelden en trends</p>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Totaal patiënten</div><div className="stat-value" style={{ color: '#00d4aa' }}>{stats?.totaalPatienten ?? 0}</div></div>
        <div className="stat-card"><div className="stat-label">Gem. kracht</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_kracht)}<span className="stat-unit">%</span></div></div>
        <div className="stat-card"><div className="stat-label">Gem. stabiliteit</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_stabiliteit)}<span className="stat-unit">%</span></div></div>
        <div className="stat-card"><div className="stat-label">Gem. pijnscore</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_pijn)}<span className="stat-unit">/10</span></div></div>
        <div className="stat-card"><div className="stat-label">Gem. KOOS</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_koos)}<span className="stat-unit">/100</span></div></div>
        <div className="stat-card"><div className="stat-label">Gem. IKDC</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_ikdc)}<span className="stat-unit">/100</span></div></div>
        <div className="stat-card"><div className="stat-label">Gem. Lysholm</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_lysholm)}<span className="stat-unit">/100</span></div></div>
        <div className="stat-card"><div className="stat-label">Gem. RTS bereidheid</div><div className="stat-value">{fmt(stats?.gemiddelden?.gem_rts)}<span className="stat-unit">/10</span></div></div>
      </div>

      {herstelCurve.length >= 2 && (
        <div className="chart-card-full">
          <div className="card-title">Gemiddelde herstelcurve (alle patiënten per week)</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={herstelCurve} margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week_na_operatie" tick={{ fill: '#64748b', fontSize: 11 }} label={{ value: 'Week', position: 'insideBottomRight', fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#141c2e', border: '1px solid #1e293b', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="gem_kracht" name="Kracht %" stroke="#00d4aa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="gem_stabiliteit" name="Stabiliteit %" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="gem_koos" name="KOOS" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="gem_pijn" name="Pijn NRS" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="charts-grid">
        <div className="chart-card">
          <div className="card-title">Fase verdeling</div>
          <BarChart data={stats?.faseVerdeling || []} xKey="fase" yKey="count" color="#3b82f6" label="patiënten" height={200} />
        </div>
        <div className="chart-card">
          <div className="card-title">Graft verdeling</div>
          <BarChart data={stats?.graftVerdeling || []} xKey="graft" yKey="count" label="patiënten" height={200} />
        </div>
        {faseData.length > 0 && (
          <div className="chart-card">
            <div className="card-title">Gem. kracht per fase</div>
            <BarChart data={faseData} xKey="fase" yKey="kracht" color="#00d4aa" label="kracht %" height={200} />
          </div>
        )}
        {faseData.length > 0 && (
          <div className="chart-card">
            <div className="card-title">Gem. pijnscore per fase</div>
            <BarChart data={faseData} xKey="fase" yKey="pijn" color="#ef4444" label="pijn NRS" height={200} />
          </div>
        )}
      </div>
    </>
  );
}
