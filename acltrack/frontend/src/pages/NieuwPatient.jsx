import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const styles = `
  .page-title { font-family: 'DM Serif Display', serif; font-size: 1.8rem; color: #e2e8f0; margin-bottom: 4px; }
  .page-subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 28px; }
  .form-card {
    background: #141c2e;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 28px 32px;
    max-width: 680px;
  }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .form-group { margin-bottom: 0; }
  .form-group-full { grid-column: 1 / -1; }
  .form-label { display: block; font-size: 0.78rem; font-weight: 600; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .required { color: #00d4aa; }
  .form-input, .form-select, .form-textarea {
    width: 100%;
    padding: 10px 12px;
    background: #0a0f1a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #00d4aa; }
  .form-textarea { min-height: 80px; resize: vertical; }
  .btn-row { display: flex; gap: 12px; margin-top: 24px; }
  .btn-primary {
    padding: 11px 24px;
    background: #00d4aa;
    color: #0a0f1a;
    border: none;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    padding: 11px 24px;
    background: transparent;
    color: #94a3b8;
    border: 1px solid #1e293b;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
  }
  .error-msg { background: #450a0a; border: 1px solid #7f1d1d; color: #fca5a5; padding: 12px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 20px; }
`;

export default function NieuwPatient() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    naam: '', geboortejaar: '', geslacht: '', operatiedatum: '',
    graft: '', zijde: '', fase: 'Fase 1', notities: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        geboortejaar: form.geboortejaar ? parseInt(form.geboortejaar) : null
      };
      const result = await api.patientAanmaken(payload);
      navigate(`/patienten/${result.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{styles}</style>
      <h1 className="page-title">Nieuwe patiënt</h1>
      <p className="page-subtitle">Registreer een nieuwe ACL revalidatiepatiënt</p>
      <div className="form-card">
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group form-group-full">
              <label className="form-label">Naam <span className="required">*</span></label>
              <input className="form-input" value={form.naam} onChange={e => update('naam', e.target.value)} required placeholder="Volledige naam" />
            </div>
            <div className="form-group">
              <label className="form-label">Geboortejaar</label>
              <input className="form-input" type="number" value={form.geboortejaar} onChange={e => update('geboortejaar', e.target.value)} placeholder="bijv. 1990" min="1900" max={new Date().getFullYear()} />
            </div>
            <div className="form-group">
              <label className="form-label">Geslacht</label>
              <select className="form-select" value={form.geslacht} onChange={e => update('geslacht', e.target.value)}>
                <option value="">Selecteer...</option>
                <option value="M">Man</option>
                <option value="V">Vrouw</option>
                <option value="X">Anders / onbekend</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Operatiedatum <span className="required">*</span></label>
              <input className="form-input" type="date" value={form.operatiedatum} onChange={e => update('operatiedatum', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Graft <span className="required">*</span></label>
              <select className="form-select" value={form.graft} onChange={e => update('graft', e.target.value)} required>
                <option value="">Selecteer graft...</option>
                {['Hamstring','Patellapees','Quadricepspees','Allograft','Synthetisch'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Zijde <span className="required">*</span></label>
              <select className="form-select" value={form.zijde} onChange={e => update('zijde', e.target.value)} required>
                <option value="">Selecteer zijde...</option>
                <option value="Links">Links</option>
                <option value="Rechts">Rechts</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Fase</label>
              <select className="form-select" value={form.fase} onChange={e => update('fase', e.target.value)}>
                {['Pre-op','Fase 1','Fase 2','Fase 3','Fase 4','Teruggekeerd'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group form-group-full">
              <label className="form-label">Notities</label>
              <textarea className="form-textarea" value={form.notities} onChange={e => update('notities', e.target.value)} placeholder="Aanvullende opmerkingen..." />
            </div>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Opslaan...' : 'Patiënt aanmaken'}</button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/patienten')}>Annuleren</button>
          </div>
        </form>
      </div>
    </>
  );
}
