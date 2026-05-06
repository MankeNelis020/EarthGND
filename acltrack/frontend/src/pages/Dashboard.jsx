import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PhaseBadge from '../components/PhaseBadge';
import BarChart from '../components/BarChart';

const styles = `
  .page-title {
    font-family: 'DM Serif Display', serif;
    font-size: 1.8rem;
    color: #e2e8f0;
    margin-bottom: 4px;
  }
  .page-subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 28px; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 28px;
  }
  .stat-card {
    background: #141c2e;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 20px 24px;
  }
  .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .stat-value { font-size: 2rem; font-weight: 700; color: #e2e8f0; }
  .stat-unit { font-size: 1rem; color: #64748b; margin-left: 4px; }
  .stat-accent { color: #00d4aa; }
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 28px;
  }
  .card {
    background: #141c2e;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 20px 24px;
  }
  .card-title { font-size: 0.85rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
  .table-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { padding: 12px 16px; text-align: left; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; }
  .table td { padding: 13px 16px; font-size: 0.88rem; border-bottom: 1px solid #0d1526; }
  .table tr:last-child td { border-bottom: none; }
  .table tr:hover td { background: #1e293b20; cursor: pointer; }
  .table-title { padding: 16px 20px; font-size: 0.85rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; }
  @media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
`;

function fmt(v, decimals = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(decimals);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [patienten, setPatienten] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.statistieken(), api.patienten()])
      .then(([s, p]) => { setStats(s); setPatienten(p.slice(0, 5)); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#64748b', padding: 40 }}>Laden...</div>;

  const faseData = (stats?.faseVerdeling || []).map(f => ({ fase: f.fase, count: f.count }));
  const graftData = (stats?.graftVerdeling || []).map(g => ({ graft: g.graft, count: g.count }));

  return (
    <>
      <style>{styles}</style>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Overzicht ACL revalidatieprogramma</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Totaal patiënten</div>
          <div className="stat-value stat-accent">{stats?.totaalPatienten ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gem. kracht</div>
          <div className="stat-value">{fmt(stats?.gemiddelden?.gem_kracht)}<span className="stat-unit">%</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gem. stabiliteit</div>
          <div className="stat-value">{fmt(stats?.gemiddelden?.gem_stabiliteit)}<span className="stat-unit">%</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gem. pijnscore</div>
          <div className="stat-value">{fmt(stats?.gemiddelden?.gem_pijn)}<span className="stat-unit">/10</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gem. KOOS score</div>
          <div className="stat-value">{fmt(stats?.gemiddelden?.gem_koos)}<span className="stat-unit">/100</span></div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-title">Fase verdeling</div>
          <BarChart data={faseData} xKey="fase" yKey="count" color="#3b82f6" label="patiënten" />
        </div>
        <div className="card">
          <div className="card-title">Graft verdeling</div>
          <BarChart data={graftData} xKey="graft" yKey="count" label="patiënten" />
        </div>
      </div>

      <div className="table-card">
        <div className="table-title">Recente patiënten</div>
        <table className="table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Fase</th>
              <th>Graft</th>
              <th>Operatiedatum</th>
              <th>Meetpunten</th>
            </tr>
          </thead>
          <tbody>
            {patienten.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>Nog geen patiënten</td></tr>
            ) : patienten.map(p => (
              <tr key={p.id} onClick={() => navigate(`/patienten/${p.id}`)}>
                <td style={{ fontWeight: 500, color: '#e2e8f0' }}>{p.naam}</td>
                <td><PhaseBadge fase={p.fase} /></td>
                <td style={{ color: '#94a3b8' }}>{p.graft}</td>
                <td style={{ color: '#94a3b8' }}>{p.operatiedatum}</td>
                <td style={{ color: '#00d4aa', fontWeight: 600 }}>{p.meetpunten_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
