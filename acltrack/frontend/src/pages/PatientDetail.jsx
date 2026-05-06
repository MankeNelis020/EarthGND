import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PhaseBadge from '../components/PhaseBadge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const styles = `
  .patient-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .patient-name { font-family: 'DM Serif Display', serif; font-size: 2rem; color: #e2e8f0; margin-bottom: 8px; }
  .patient-meta { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
  .meta-item { color: #64748b; font-size: 0.85rem; }
  .meta-item strong { color: #94a3b8; }
  .btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .btn-primary { padding: 9px 18px; background: #00d4aa; color: #0a0f1a; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.88rem; font-family: 'DM Sans', sans-serif; }
  .btn-secondary { padding: 9px 18px; background: transparent; color: #94a3b8; border: 1px solid #1e293b; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 0.88rem; font-family: 'DM Sans', sans-serif; }
  .btn-danger { padding: 9px 18px; background: transparent; color: #f87171; border: 1px solid #7f1d1d; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 0.88rem; font-family: 'DM Sans', sans-serif; }
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .metric-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 10px; padding: 14px 16px; }
  .metric-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .metric-value { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; }
  .metric-unit { font-size: 0.8rem; color: #64748b; }
  .metric-trend { font-size: 0.75rem; margin-top: 4px; }
  .trend-up { color: #00d4aa; }
  .trend-down { color: #f87171; }
  .trend-neutral { color: #64748b; }
  .section-title { font-size: 0.85rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 14px; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .chart-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 20px; }
  .chart-title { font-size: 0.78rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; }
  .table-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .table th { padding: 10px 14px; text-align: left; font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e293b; }
  .table td { padding: 10px 14px; border-bottom: 1px solid #0d1526; color: #94a3b8; }
  .table tr:last-child td { border-bottom: none; }
  .notities-card { background: #141c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
  .notities-text { color: #94a3b8; font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; }
  .modal { background: #141c2e; border: 1px solid #1e293b; border-radius: 14px; padding: 28px 32px; width: 100%; max-width: 700px; }
  .modal-title { font-family: 'DM Serif Display', serif; font-size: 1.4rem; color: #e2e8f0; margin-bottom: 24px; }
  .modal-section { margin-bottom: 20px; }
  .modal-section-title { font-size: 0.78rem; font-weight: 700; color: #00d4aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 1px solid #1e293b; }
  .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .modal-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .form-group { }
  .form-group-full { grid-column: 1 / -1; }
  .form-label { display: block; font-size: 0.75rem; font-weight: 600; color: #94a3b8; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.3px; }
  .form-hint { font-size: 0.7rem; color: #475569; margin-top: 2px; }
  .form-input, .form-select, .form-textarea {
    width: 100%;
    padding: 9px 11px;
    background: #0a0f1a;
    border: 1px solid #1e293b;
    border-radius: 7px;
    color: #e2e8f0;
    font-size: 0.88rem;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #00d4aa; }
  .form-textarea { min-height: 64px; resize: vertical; }
  .slider-wrap { display: flex; align-items: center; gap: 10px; }
  .slider { flex: 1; accent-color: #00d4aa; }
  .slider-val { min-width: 28px; text-align: right; color: #00d4aa; font-weight: 600; font-size: 0.9rem; }
  .modal-footer { display: flex; gap: 10px; margin-top: 24px; }
  .error-msg { background: #450a0a; border: 1px solid #7f1d1d; color: #fca5a5; padding: 10px 14px; border-radius: 8px; font-size: 0.82rem; margin-bottom: 16px; }
  @media (max-width: 900px) {
    .charts-grid { grid-template-columns: 1fr; }
    .modal-grid { grid-template-columns: 1fr; }
    .modal-grid-3 { grid-template-columns: 1fr 1fr; }
  }
`;

function fmt(v, dec = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(dec);
}

function Trend({ curr, prev, invertGood = false }) {
  if (curr == null || prev == null) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.01) return <span className="trend-neutral">→ gelijk</span>;
  const up = diff > 0;
  const good = invertGood ? !up : up;
  return (
    <span className={good ? 'trend-up' : 'trend-down'}>
      {up ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}
    </span>
  );
}

function MetricCard({ label, value, unit, curr, prev, invertGood }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value != null ? value : '—'}
        {value != null && unit && <span className="metric-unit"> {unit}</span>}
      </div>
      <div className="metric-trend">
        <Trend curr={curr} prev={prev} invertGood={invertGood} />
      </div>
    </div>
  );
}

const CHART_COLORS = ['#00d4aa', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

function MeetpuntGrafiek({ data, velden, title }) {
  if (!data || data.length < 2) return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '20px 0' }}>Minimaal 2 meetpunten nodig</div>
    </div>
  );
  const sorted = [...data].sort((a, b) => a.week_na_operatie - b.week_na_operatie);
  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={sorted} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="week_na_operatie" tick={{ fill: '#64748b', fontSize: 10 }} label={{ value: 'Wk', position: 'insideRight', fill: '#475569', fontSize: 10 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#141c2e', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          {velden.map((v, i) => (
            <Line key={v.key} type="monotone" dataKey={v.key} name={v.label} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const LEGE_FORM = {
  datum: new Date().toISOString().slice(0, 10),
  week_na_operatie: '',
  notities: '',
  kracht_pct: '', stabiliteit_pct: '', bewegingsuitslag_gr: '', spiermassa_pct: '',
  quad_ham_ratio: '', single_leg_hop_pct: '', balans_score: '', zwelling_cm: '',
  looppatroon_score: '', sportbelasting_pct: '',
  pijn_score: 5, koos_score: '', ikdc_score: '', lysholm_score: '',
  vertrouwen_score: 5, rts_bereidheid: 5
};

function MeetpuntModal({ patientId, meetpunt, onSave, onClose }) {
  const [form, setForm] = useState(meetpunt ? { ...meetpunt } : { ...LEGE_FORM });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.datum || form.week_na_operatie === '') {
      setError('Datum en week na operatie zijn verplicht');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        datum: form.datum,
        week_na_operatie: parseInt(form.week_na_operatie),
        notities: form.notities || null,
        kracht_pct: numOrNull(form.kracht_pct),
        stabiliteit_pct: numOrNull(form.stabiliteit_pct),
        bewegingsuitslag_gr: numOrNull(form.bewegingsuitslag_gr),
        spiermassa_pct: numOrNull(form.spiermassa_pct),
        quad_ham_ratio: numOrNull(form.quad_ham_ratio),
        single_leg_hop_pct: numOrNull(form.single_leg_hop_pct),
        balans_score: numOrNull(form.balans_score),
        zwelling_cm: numOrNull(form.zwelling_cm),
        looppatroon_score: numOrNull(form.looppatroon_score),
        sportbelasting_pct: numOrNull(form.sportbelasting_pct),
        pijn_score: parseInt(form.pijn_score),
        koos_score: numOrNull(form.koos_score),
        ikdc_score: numOrNull(form.ikdc_score),
        lysholm_score: numOrNull(form.lysholm_score),
        vertrouwen_score: parseInt(form.vertrouwen_score),
        rts_bereidheid: parseInt(form.rts_bereidheid)
      };
      if (meetpunt) {
        await api.meetpuntBijwerken(patientId, meetpunt.id, payload);
      } else {
        await api.meetpuntToevoegen(patientId, payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function numInput(key, label, hint) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input className="form-input" type="number" step="0.1" value={form[key] ?? ''} onChange={e => set(key, e.target.value)} placeholder="—" />
        {hint && <div className="form-hint">{hint}</div>}
      </div>
    );
  }

  function sliderInput(key, label, min, max, hint) {
    return (
      <div className="form-group form-group-full">
        <label className="form-label">{label}</label>
        <div className="slider-wrap">
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{min}</span>
          <input className="slider" type="range" min={min} max={max} value={form[key] ?? min} onChange={e => set(key, parseInt(e.target.value))} />
          <span className="slider-val">{form[key] ?? min}</span>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>/{max}</span>
        </div>
        {hint && <div className="form-hint">{hint}</div>}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">{meetpunt ? 'Meetpunt bewerken' : 'Nieuw meetpunt toevoegen'}</div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="modal-section">
            <div className="modal-section-title">Sessie-informatie</div>
            <div className="modal-grid">
              <div className="form-group">
                <label className="form-label">Datum *</label>
                <input className="form-input" type="date" value={form.datum} onChange={e => set('datum', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Week na operatie *</label>
                <input className="form-input" type="number" min="0" max="104" value={form.week_na_operatie} onChange={e => set('week_na_operatie', e.target.value)} required placeholder="bijv. 12" />
              </div>
              <div className="form-group form-group-full">
                <label className="form-label">Notities sessie</label>
                <textarea className="form-textarea" value={form.notities} onChange={e => set('notities', e.target.value)} placeholder="Opmerkingen bij deze sessie..." />
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Objectieve metingen</div>
            <div className="modal-grid">
              {numInput('kracht_pct', 'Kracht % (t.o.v. gezonde zijde)', '0–150%')}
              {numInput('stabiliteit_pct', 'Stabiliteit %', '0–100%')}
              {numInput('bewegingsuitslag_gr', 'Bewegingsuitslag ROM (graden)', '0–145°')}
              {numInput('spiermassa_pct', 'Spiermassa % (t.o.v. gezonde zijde)', '0–150%')}
              {numInput('quad_ham_ratio', 'Quad/Hamstring ratio', 'bijv. 0.65')}
              {numInput('single_leg_hop_pct', 'Single leg hop % (t.o.v. gezonde zijde)', '0–150%')}
              {numInput('balans_score', 'Balans / proprioceptie score', '0–100')}
              {numInput('zwelling_cm', 'Zwelling omtrek knie (cm)', 'bijv. 38.5')}
              {numInput('looppatroon_score', 'Looppatroon score', '0–100')}
              {numInput('sportbelasting_pct', 'Sportspecifieke belasting %', '0–100%')}
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Subjectieve scores</div>
            <div className="modal-grid">
              {sliderInput('pijn_score', 'Pijnscore NRS (0 = geen pijn, 10 = ondraaglijk)', 0, 10, 'Numerieke rating schaal')}
              {numInput('koos_score', 'KOOS score', '0–100 (hoger = beter)')}
              {numInput('ikdc_score', 'IKDC score', '0–100 (hoger = beter)')}
              {numInput('lysholm_score', 'Lysholm score', '0–100 (hoger = beter)')}
              {sliderInput('vertrouwen_score', 'Vertrouwen in knie (0–10)', 0, 10, 'Subjectief vertrouwen in knie bij belasting')}
              {sliderInput('rts_bereidheid', 'Return-to-sport bereidheid (0–10)', 0, 10, 'Mate van gereedheid voor sporthervatting')}
            </div>
          </div>

          <div className="modal-footer">
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Opslaan...' : 'Opslaan'}</button>
            <button type="button" className="btn-secondary" onClick={onClose}>Annuleren</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMeetpunt, setEditMeetpunt] = useState(null);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [editForm, setEditForm] = useState({});

  async function laad() {
    setLoading(true);
    try {
      const data = await api.patient(id);
      setPatient(data);
    } catch {
      navigate('/patienten');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { laad(); }, [id]);

  if (loading) return <div style={{ color: '#64748b', padding: 40 }}>Laden...</div>;
  if (!patient) return null;

  const meetpunten = patient.meetpunten || [];
  const laatste = meetpunten[0];
  const vorigeIdx = meetpunten.findIndex(m => m.id === laatste?.id) + 1;
  const vorige = meetpunten[vorigeIdx] || null;

  async function verwijderPatient() {
    if (!confirm(`Weet u zeker dat u ${patient.naam} wilt archiveren?`)) return;
    await api.patientVerwijderen(id);
    navigate('/patienten');
  }

  async function verwijderMeetpunt(mid) {
    if (!confirm('Meetpunt verwijderen?')) return;
    await api.meetpuntVerwijderen(id, mid);
    laad();
  }

  async function slaPatientOp(e) {
    e.preventDefault();
    await api.patientBijwerken(id, editForm);
    setShowEditPatient(false);
    laad();
  }

  function startEditPatient() {
    setEditForm({
      naam: patient.naam, geboortejaar: patient.geboortejaar || '',
      geslacht: patient.geslacht || '', operatiedatum: patient.operatiedatum,
      graft: patient.graft, zijde: patient.zijde, fase: patient.fase,
      notities: patient.notities || ''
    });
    setShowEditPatient(true);
  }

  return (
    <>
      <style>{styles}</style>
      {(showModal || editMeetpunt) && (
        <MeetpuntModal
          patientId={id}
          meetpunt={editMeetpunt}
          onSave={() => { setShowModal(false); setEditMeetpunt(null); laad(); }}
          onClose={() => { setShowModal(false); setEditMeetpunt(null); }}
        />
      )}

      <div className="patient-header">
        <div>
          <h1 className="patient-name">{patient.naam}</h1>
          <div className="patient-meta">
            <PhaseBadge fase={patient.fase} size="lg" />
            <span className="meta-item"><strong>Graft:</strong> {patient.graft}</span>
            <span className="meta-item"><strong>Zijde:</strong> {patient.zijde}</span>
            <span className="meta-item"><strong>Operatie:</strong> {patient.operatiedatum}</span>
            {patient.geboortejaar && (
              <span className="meta-item"><strong>Leeftijd:</strong> {new Date().getFullYear() - patient.geboortejaar} jaar</span>
            )}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Meetpunt</button>
          <button className="btn-secondary" onClick={startEditPatient}>Bewerken</button>
          <button className="btn-danger" onClick={verwijderPatient}>Archiveren</button>
        </div>
      </div>

      {showEditPatient && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowEditPatient(false); }}>
          <div className="modal">
            <div className="modal-title">Patiënt bewerken</div>
            <form onSubmit={slaPatientOp}>
              <div className="modal-grid">
                <div className="form-group form-group-full">
                  <label className="form-label">Naam</label>
                  <input className="form-input" value={editForm.naam || ''} onChange={e => setEditForm(f => ({ ...f, naam: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fase</label>
                  <select className="form-input" value={editForm.fase || ''} onChange={e => setEditForm(f => ({ ...f, fase: e.target.value }))}>
                    {['Pre-op','Fase 1','Fase 2','Fase 3','Fase 4','Teruggekeerd'].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Graft</label>
                  <select className="form-input" value={editForm.graft || ''} onChange={e => setEditForm(f => ({ ...f, graft: e.target.value }))}>
                    {['Hamstring','Patellapees','Quadricepspees','Allograft','Synthetisch'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group form-group-full">
                  <label className="form-label">Notities</label>
                  <textarea className="form-textarea" value={editForm.notities || ''} onChange={e => setEditForm(f => ({ ...f, notities: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-primary">Opslaan</button>
                <button type="button" className="btn-secondary" onClick={() => setShowEditPatient(false)}>Annuleren</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="section-title">Laatste meetwaarden</div>
      <div className="metrics-grid">
        <MetricCard label="Kracht" value={fmt(laatste?.kracht_pct)} unit="%" curr={laatste?.kracht_pct} prev={vorige?.kracht_pct} />
        <MetricCard label="Stabiliteit" value={fmt(laatste?.stabiliteit_pct)} unit="%" curr={laatste?.stabiliteit_pct} prev={vorige?.stabiliteit_pct} />
        <MetricCard label="ROM" value={fmt(laatste?.bewegingsuitslag_gr)} unit="°" curr={laatste?.bewegingsuitslag_gr} prev={vorige?.bewegingsuitslag_gr} />
        <MetricCard label="Spiermassa" value={fmt(laatste?.spiermassa_pct)} unit="%" curr={laatste?.spiermassa_pct} prev={vorige?.spiermassa_pct} />
        <MetricCard label="Q/H ratio" value={fmt(laatste?.quad_ham_ratio, 2)} curr={laatste?.quad_ham_ratio} prev={vorige?.quad_ham_ratio} />
        <MetricCard label="Single leg hop" value={fmt(laatste?.single_leg_hop_pct)} unit="%" curr={laatste?.single_leg_hop_pct} prev={vorige?.single_leg_hop_pct} />
        <MetricCard label="Balans" value={fmt(laatste?.balans_score)} unit="/100" curr={laatste?.balans_score} prev={vorige?.balans_score} />
        <MetricCard label="Zwelling" value={fmt(laatste?.zwelling_cm)} unit="cm" curr={laatste?.zwelling_cm} prev={vorige?.zwelling_cm} invertGood />
        <MetricCard label="Pijnscore" value={fmt(laatste?.pijn_score, 0)} unit="/10" curr={laatste?.pijn_score} prev={vorige?.pijn_score} invertGood />
        <MetricCard label="KOOS" value={fmt(laatste?.koos_score)} unit="/100" curr={laatste?.koos_score} prev={vorige?.koos_score} />
        <MetricCard label="IKDC" value={fmt(laatste?.ikdc_score)} unit="/100" curr={laatste?.ikdc_score} prev={vorige?.ikdc_score} />
        <MetricCard label="Lysholm" value={fmt(laatste?.lysholm_score)} unit="/100" curr={laatste?.lysholm_score} prev={vorige?.lysholm_score} />
        <MetricCard label="Vertrouwen" value={fmt(laatste?.vertrouwen_score, 0)} unit="/10" curr={laatste?.vertrouwen_score} prev={vorige?.vertrouwen_score} />
        <MetricCard label="RTS bereidheid" value={fmt(laatste?.rts_bereidheid, 0)} unit="/10" curr={laatste?.rts_bereidheid} prev={vorige?.rts_bereidheid} />
      </div>

      <div className="section-title">Verloop grafieken</div>
      <div className="charts-grid">
        <MeetpuntGrafiek data={meetpunten} title="Kracht & Stabiliteit" velden={[{key:'kracht_pct',label:'Kracht %'},{key:'stabiliteit_pct',label:'Stabiliteit %'}]} />
        <MeetpuntGrafiek data={meetpunten} title="ROM & Spiermassa" velden={[{key:'bewegingsuitslag_gr',label:'ROM (°)'},{key:'spiermassa_pct',label:'Spiermassa %'}]} />
        <MeetpuntGrafiek data={meetpunten} title="Pijn & Vertrouwen" velden={[{key:'pijn_score',label:'Pijn NRS'},{key:'vertrouwen_score',label:'Vertrouwen'}]} />
        <MeetpuntGrafiek data={meetpunten} title="KOOS / IKDC / Lysholm" velden={[{key:'koos_score',label:'KOOS'},{key:'ikdc_score',label:'IKDC'},{key:'lysholm_score',label:'Lysholm'}]} />
        <MeetpuntGrafiek data={meetpunten} title="Single leg hop & Balans" velden={[{key:'single_leg_hop_pct',label:'SL Hop %'},{key:'balans_score',label:'Balans'}]} />
        <MeetpuntGrafiek data={meetpunten} title="Sportbelasting & RTS" velden={[{key:'sportbelasting_pct',label:'Sportbelasting %'},{key:'rts_bereidheid',label:'RTS bereidheid'}]} />
      </div>

      {patient.notities && (
        <>
          <div className="section-title">Notities patiënt</div>
          <div className="notities-card">
            <div className="notities-text">{patient.notities}</div>
          </div>
        </>
      )}

      <div className="section-title">Alle meetpunten ({meetpunten.length})</div>
      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Week</th>
              <th>Kracht%</th>
              <th>Stab%</th>
              <th>ROM°</th>
              <th>Pijn</th>
              <th>KOOS</th>
              <th>IKDC</th>
              <th>Vertr.</th>
              <th>RTS</th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody>
            {meetpunten.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                  Nog geen meetpunten. Klik op "+ Meetpunt" om te beginnen.
                </td>
              </tr>
            ) : meetpunten.map(m => (
              <tr key={m.id}>
                <td>{m.datum}</td>
                <td style={{ color: '#00d4aa', fontWeight: 600 }}>Wk {m.week_na_operatie}</td>
                <td>{fmt(m.kracht_pct)}</td>
                <td>{fmt(m.stabiliteit_pct)}</td>
                <td>{fmt(m.bewegingsuitslag_gr)}</td>
                <td style={{ color: m.pijn_score > 6 ? '#f87171' : m.pijn_score > 3 ? '#fb923c' : '#00d4aa' }}>
                  {m.pijn_score ?? '—'}
                </td>
                <td>{fmt(m.koos_score)}</td>
                <td>{fmt(m.ikdc_score)}</td>
                <td>{m.vertrouwen_score ?? '—'}</td>
                <td>{m.rts_bereidheid ?? '—'}</td>
                <td>
                  <button
                    style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px' }}
                    onClick={() => setEditMeetpunt(m)}
                  >✏</button>
                  <button
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px' }}
                    onClick={() => verwijderMeetpunt(m.id)}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
