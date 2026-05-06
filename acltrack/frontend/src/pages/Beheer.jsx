import React, { useEffect, useState } from 'react';
import { api } from '../api';

const styles = `
  .page-title { font-family: 'DM Serif Display', serif; font-size: 1.8rem; color: #e2e8f0; margin-bottom: 4px; }
  .page-subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 28px; }
  .sections-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 22px 26px; }
  .card-title { font-size: 0.82rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 18px; }
  .user-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #0d1526; }
  .user-row:last-child { border-bottom: none; }
  .user-name { font-weight: 600; color: #e2e8f0; font-size: 0.9rem; }
  .user-email { color: #64748b; font-size: 0.78rem; margin-top: 2px; }
  .user-meta { display: flex; align-items: center; gap: 8px; }
  .badge-admin { background: #1e1b4b; color: #8b5cf6; border: 1px solid #4c1d95; padding: 2px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; }
  .badge-fysio { background: #0c1a2e; color: #3b82f6; border: 1px solid #1d4ed8; padding: 2px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; }
  .badge-inactief { background: #1c1917; color: #78716c; border: 1px solid #44403c; padding: 2px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; }
  .toggle-btn { background: none; border: 1px solid #1e293b; border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; color: #94a3b8; font-family: 'DM Sans', sans-serif; }
  .toggle-btn:hover { border-color: #94a3b8; }
  .form-group { margin-bottom: 14px; }
  .form-label { display: block; font-size: 0.75rem; font-weight: 600; color: #94a3b8; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.3px; }
  .form-input, .form-select {
    width: 100%;
    padding: 9px 12px;
    background: #0a0f1a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 0.88rem;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus { border-color: #00d4aa; }
  .btn-primary { padding: 10px 20px; background: #00d4aa; color: #0a0f1a; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.88rem; width: 100%; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .success-msg { background: #064e3b; border: 1px solid #065f46; color: #6ee7b7; padding: 10px 14px; border-radius: 8px; font-size: 0.82rem; margin-bottom: 14px; }
  .error-msg { background: #450a0a; border: 1px solid #7f1d1d; color: #fca5a5; padding: 10px 14px; border-radius: 8px; font-size: 0.82rem; margin-bottom: 14px; }
  .divider { height: 1px; background: #1e293b; margin: 20px 0; }
  @media (max-width: 900px) { .sections-grid { grid-template-columns: 1fr; } }
`;

export default function Beheer() {
  const [gebruikers, setGebruikers] = useState([]);
  const [nieuwForm, setNieuwForm] = useState({ naam: '', email: '', wachtwoord: '', rol: 'fysiotherapeut' });
  const [nieuwMsg, setNieuwMsg] = useState('');
  const [nieuwErr, setNieuwErr] = useState('');
  const [nieuwLoading, setNieuwLoading] = useState(false);
  const [wwForm, setWwForm] = useState({ huidig: '', nieuw: '', bevestig: '' });
  const [wwMsg, setWwMsg] = useState('');
  const [wwErr, setWwErr] = useState('');
  const [wwLoading, setWwLoading] = useState(false);

  async function laadGebruikers() {
    try {
      const data = await api.gebruikers();
      setGebruikers(data);
    } catch {}
  }

  useEffect(() => { laadGebruikers(); }, []);

  async function handleNieuwGebruiker(e) {
    e.preventDefault();
    setNieuwErr(''); setNieuwMsg('');
    setNieuwLoading(true);
    try {
      await api.gebruikerAanmaken(nieuwForm);
      setNieuwMsg(`Medewerker ${nieuwForm.naam} aangemaakt`);
      setNieuwForm({ naam: '', email: '', wachtwoord: '', rol: 'fysiotherapeut' });
      laadGebruikers();
    } catch (err) {
      setNieuwErr(err.message);
    } finally {
      setNieuwLoading(false);
    }
  }

  async function toggleActief(id, huidig) {
    try {
      await api.gebruikerBijwerken(id, { actief: huidig ? 0 : 1 });
      laadGebruikers();
    } catch {}
  }

  async function handleWachtwoord(e) {
    e.preventDefault();
    setWwErr(''); setWwMsg('');
    if (wwForm.nieuw !== wwForm.bevestig) {
      setWwErr('Nieuwe wachtwoorden komen niet overeen');
      return;
    }
    if (wwForm.nieuw.length < 8) {
      setWwErr('Nieuw wachtwoord moet minimaal 8 tekens bevatten');
      return;
    }
    setWwLoading(true);
    try {
      await api.wachtwoordWijzigen(wwForm.huidig, wwForm.nieuw);
      setWwMsg('Wachtwoord succesvol gewijzigd');
      setWwForm({ huidig: '', nieuw: '', bevestig: '' });
    } catch (err) {
      setWwErr(err.message);
    } finally {
      setWwLoading(false);
    }
  }

  return (
    <>
      <style>{styles}</style>
      <h1 className="page-title">Beheer</h1>
      <p className="page-subtitle">Gebruikersbeheer en accountinstellingen</p>

      <div className="sections-grid">
        <div>
          <div className="card">
            <div className="card-title">Medewerkers</div>
            {gebruikers.map(u => (
              <div className="user-row" key={u.id}>
                <div>
                  <div className="user-name">{u.naam}</div>
                  <div className="user-email">{u.email}</div>
                </div>
                <div className="user-meta">
                  {!u.actief ? (
                    <span className="badge-inactief">Inactief</span>
                  ) : u.rol === 'admin' ? (
                    <span className="badge-admin">Admin</span>
                  ) : (
                    <span className="badge-fysio">Fysio</span>
                  )}
                  <button className="toggle-btn" onClick={() => toggleActief(u.id, u.actief)}>
                    {u.actief ? 'Deactiveren' : 'Activeren'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">Nieuwe medewerker</div>
            {nieuwMsg && <div className="success-msg">{nieuwMsg}</div>}
            {nieuwErr && <div className="error-msg">{nieuwErr}</div>}
            <form onSubmit={handleNieuwGebruiker}>
              <div className="form-group">
                <label className="form-label">Naam</label>
                <input className="form-input" value={nieuwForm.naam} onChange={e => setNieuwForm(f => ({ ...f, naam: e.target.value }))} required placeholder="Volledige naam" />
              </div>
              <div className="form-group">
                <label className="form-label">E-mailadres</label>
                <input className="form-input" type="email" value={nieuwForm.email} onChange={e => setNieuwForm(f => ({ ...f, email: e.target.value }))} required placeholder="naam@praktijk.nl" />
              </div>
              <div className="form-group">
                <label className="form-label">Tijdelijk wachtwoord</label>
                <input className="form-input" type="password" value={nieuwForm.wachtwoord} onChange={e => setNieuwForm(f => ({ ...f, wachtwoord: e.target.value }))} required placeholder="Minimaal 8 tekens" />
              </div>
              <div className="form-group">
                <label className="form-label">Rol</label>
                <select className="form-select" value={nieuwForm.rol} onChange={e => setNieuwForm(f => ({ ...f, rol: e.target.value }))}>
                  <option value="fysiotherapeut">Fysiotherapeut</option>
                  <option value="admin">Beheerder (Admin)</option>
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={nieuwLoading}>
                {nieuwLoading ? 'Aanmaken...' : 'Medewerker aanmaken'}
              </button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Wachtwoord wijzigen</div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>Wijzig het wachtwoord van uw eigen account.</p>
          {wwMsg && <div className="success-msg">{wwMsg}</div>}
          {wwErr && <div className="error-msg">{wwErr}</div>}
          <form onSubmit={handleWachtwoord}>
            <div className="form-group">
              <label className="form-label">Huidig wachtwoord</label>
              <input className="form-input" type="password" value={wwForm.huidig} onChange={e => setWwForm(f => ({ ...f, huidig: e.target.value }))} required placeholder="Huidig wachtwoord" />
            </div>
            <div className="form-group">
              <label className="form-label">Nieuw wachtwoord</label>
              <input className="form-input" type="password" value={wwForm.nieuw} onChange={e => setWwForm(f => ({ ...f, nieuw: e.target.value }))} required placeholder="Minimaal 8 tekens" />
            </div>
            <div className="form-group">
              <label className="form-label">Bevestig nieuw wachtwoord</label>
              <input className="form-input" type="password" value={wwForm.bevestig} onChange={e => setWwForm(f => ({ ...f, bevestig: e.target.value }))} required placeholder="Herhaal nieuw wachtwoord" />
            </div>
            <button type="submit" className="btn-primary" disabled={wwLoading}>
              {wwLoading ? 'Wijzigen...' : 'Wachtwoord wijzigen'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
