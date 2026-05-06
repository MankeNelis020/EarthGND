import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PhaseBadge from '../components/PhaseBadge';

const styles = `
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
  .page-title { font-family: 'DM Serif Display', serif; font-size: 1.8rem; color: #e2e8f0; }
  .page-subtitle { color: #64748b; font-size: 0.9rem; margin-top: 4px; }
  .btn-primary {
    padding: 10px 20px;
    background: #00d4aa;
    color: #0a0f1a;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    white-space: nowrap;
  }
  .btn-primary:hover { opacity: 0.9; }
  .filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .search-input {
    flex: 1;
    min-width: 200px;
    padding: 10px 14px;
    background: #141c2e;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-family: 'DM Sans', sans-serif;
    outline: none;
  }
  .search-input:focus { border-color: #00d4aa; }
  .search-input::placeholder { color: #64748b; }
  .select-filter {
    padding: 10px 14px;
    background: #141c2e;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    cursor: pointer;
  }
  .table-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { padding: 12px 16px; text-align: left; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; }
  .table td { padding: 13px 16px; font-size: 0.88rem; border-bottom: 1px solid #0d1526; }
  .table tr:last-child td { border-bottom: none; }
  .table tbody tr:hover td { background: #1e293b30; cursor: pointer; }
  .empty { text-align: center; color: #64748b; padding: 48px; }
`;

const FASEN = ['', 'Pre-op', 'Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Teruggekeerd'];

function leeftijd(geboortejaar) {
  if (!geboortejaar) return '—';
  return new Date().getFullYear() - geboortejaar;
}

export default function Patienten() {
  const navigate = useNavigate();
  const [patienten, setPatienten] = useState([]);
  const [zoek, setZoek] = useState('');
  const [fase, setFase] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = {};
    if (fase) params.fase = fase;
    if (zoek) params.zoek = zoek;
    setLoading(true);
    api.patienten(params)
      .then(setPatienten)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [zoek, fase]);

  return (
    <>
      <style>{styles}</style>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patiënten</h1>
          <p className="page-subtitle">{patienten.length} patiënt{patienten.length !== 1 ? 'en' : ''} gevonden</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/patienten/nieuw')}>+ Nieuwe patiënt</button>
      </div>

      <div className="filters">
        <input
          className="search-input"
          type="text"
          placeholder="Zoek op naam..."
          value={zoek}
          onChange={e => setZoek(e.target.value)}
        />
        <select className="select-filter" value={fase} onChange={e => setFase(e.target.value)}>
          {FASEN.map(f => <option key={f} value={f}>{f || 'Alle fasen'}</option>)}
        </select>
      </div>

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Leeftijd</th>
              <th>Graft</th>
              <th>Zijde</th>
              <th>Operatiedatum</th>
              <th>Fase</th>
              <th>Meetpunten</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="empty">Laden...</td></tr>
            ) : patienten.length === 0 ? (
              <tr><td colSpan={7} className="empty">Geen patiënten gevonden</td></tr>
            ) : patienten.map(p => (
              <tr key={p.id} onClick={() => navigate(`/patienten/${p.id}`)}>
                <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{p.naam}</td>
                <td style={{ color: '#94a3b8' }}>{leeftijd(p.geboortejaar)}</td>
                <td style={{ color: '#94a3b8' }}>{p.graft}</td>
                <td style={{ color: '#94a3b8' }}>{p.zijde}</td>
                <td style={{ color: '#94a3b8' }}>{p.operatiedatum}</td>
                <td><PhaseBadge fase={p.fase} /></td>
                <td style={{ color: '#00d4aa', fontWeight: 600 }}>{p.meetpunten_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
