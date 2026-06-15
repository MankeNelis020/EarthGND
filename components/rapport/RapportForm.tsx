'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  InspectionReport, Meting, Bevinding,
  Systeemtype, PassFail, BevindingPrioriteit,
} from '@/lib/types/rapport';
import { KlicWidget } from '@/components/tools/KlicWidget';
import {
  NORM_PARAMS, VERPLICHTE_METINGEN, OPTIONELE_METINGEN,
  isVerplicht, toetsMeting, berekenAanrakingsspanning,
} from '@/lib/rapport-config';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stap = 'algemeen' | 'metingen' | 'bevindingen' | 'ondertekening' | 'delen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-white/70">
        {label}
        {required && <span className="ml-1 text-[#E8761A]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-white/70">{hint}</p>}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', step, min, max, disabled,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none disabled:opacity-40"
    />
  );
}

function Select({
  value, onChange, options, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm text-white focus:border-[#E8761A]/50 focus:outline-none disabled:opacity-40"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Textarea({
  value, onChange, placeholder, rows = 3,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none resize-none"
    />
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-white/70">{title}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function PassFailBadge({ value }: { value?: PassFail | null }) {
  if (value === 'pass') return (
    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">VOLDOET</span>
  );
  if (value === 'fail') return (
    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">AFWIJKING</span>
  );
  return <span className="text-[10px] text-white/70">n.v.t.</span>;
}

function StapNav({
  stap, setStap, locked,
}: { stap: Stap; setStap: (s: Stap) => void; locked: boolean }) {
  const stappen: { key: Stap; label: string; icon: string }[] = [
    { key: 'algemeen',      label: 'Gegevens',  icon: '①' },
    { key: 'metingen',      label: 'Metingen',  icon: '②' },
    { key: 'bevindingen',   label: 'Conclusie', icon: '③' },
    { key: 'ondertekening', label: 'Tekenen',   icon: '④' },
    { key: 'delen',         label: 'Delen',     icon: '⑤' },
  ];

  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-[#111] p-1.5">
      {stappen.map(s => (
        <button
          key={s.key}
          onClick={() => !locked || s.key === 'delen' ? setStap(s.key) : undefined}
          className={`flex-1 min-w-0 rounded-xl py-2.5 text-xs font-semibold transition-all whitespace-nowrap ${
            stap === s.key
              ? 'bg-[#E8761A] text-white'
              : locked && s.key !== 'delen'
              ? 'text-white/70 cursor-default'
              : 'text-white/70 hover:text-white'
          }`}
        >
          <span className="hidden sm:inline">{s.icon} </span>{s.label}
        </button>
      ))}
    </div>
  );
}

// ─── Meting row ───────────────────────────────────────────────────────────────

function MetingRow({
  meting, systeemtype, onChange, locked,
}: {
  meting: Meting;
  systeemtype: Systeemtype;
  onChange: (m: Meting) => void;
  locked: boolean;
}) {
  const param = NORM_PARAMS[meting.type];
  const verplicht = isVerplicht(meting.type, systeemtype);
  const computed = toetsMeting(meting.type, meting.waarde, meting.toetswaarde ?? null);
  const pf: PassFail | null = meting.waarde != null ? computed : null;

  // Aanrakingsspanning rekenhulp for Ra + RCD
  const aanraking = meting.type === 'ra' && meting.waarde != null
    ? berekenAanrakingsspanning(meting.waarde, 30)
    : null;

  return (
    <div className="rounded-xl border border-white/8 bg-white/2 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-white">{param.label}</span>
          {verplicht && <span className="ml-2 text-[10px] text-[#E8761A]">verplicht</span>}
          <p className="mt-0.5 text-[10px] text-white/70">{param.beschrijving}</p>
        </div>
        <PassFailBadge value={pf} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Gemeten waarde (${param.eenheid})`}>
          <Input
            type="number"
            step="0.01"
            min={String(param.sanityMin)}
            max={String(param.sanityMax)}
            value={meting.waarde ?? ''}
            onChange={v => onChange({ ...meting, waarde: v === '' ? null : parseFloat(v) })}
            placeholder="0.00"
            disabled={locked}
          />
        </Field>
        <Field label={`Toetswaarde (${param.eenheid})`} hint={param.toetswaardeLabel}>
          <Input
            type="number"
            step="0.01"
            value={meting.toetswaarde ?? ''}
            onChange={v => onChange({ ...meting, toetswaarde: v === '' ? null : parseFloat(v) })}
            placeholder={param.defaultToetswaarde != null ? String(param.defaultToetswaarde) : 'invullen'}
            disabled={locked}
          />
        </Field>
      </div>

      <Field label="Meetmethode">
        <Select
          value={meting.meetmethode ?? ''}
          onChange={v => onChange({ ...meting, meetmethode: v })}
          options={param.meetmethodeOpties.map(o => ({ value: o, label: o }))}
          placeholder="Selecteer methode"
          disabled={locked}
        />
      </Field>

      {/* Rekenhulp aanrakingsspanning */}
      {meting.type === 'ra' && aanraking !== null && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <p className="text-[10px] text-blue-400 font-semibold mb-1">Rekenhulp aanrakingsspanning</p>
          <p className="text-[10px] text-white/70">
            Ra × IΔn = {meting.waarde} Ω × 30 mA = <strong className="text-white">{aanraking.toFixed(2)} V</strong>
          </p>
          <p className="text-[10px] text-white/70 mt-0.5">
            De installateur toetst dit zelf aan de geldende UL-grens (25 V of 50 V).
          </p>
        </div>
      )}

      <Field label="Notities (optioneel)">
        <Input
          value={meting.notities ?? ''}
          onChange={v => onChange({ ...meting, notities: v })}
          placeholder="Bijv. locatie meetpunt, bijzonderheden"
          disabled={locked}
        />
      </Field>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialReport: InspectionReport;
  initialMetingen: Meting[];
}

export function RapportForm({ initialReport, initialMetingen }: Props) {
  const [report, setReport] = useState<InspectionReport>(initialReport);
  const [metingen, setMetingen] = useState<Meting[]>(initialMetingen);
  const [stap, setStap] = useState<Stap>('algemeen');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locked = report.status === 'ondertekend';

  // ── Autosave ──────────────────────────────────────────────────────────────
  const save = useCallback(async (r: InspectionReport, m: Meting[]) => {
    if (locked) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/rapport/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opdrachtgever:       r.opdrachtgever,
          locatie:             r.locatie,
          soort_installatie:   r.soort_installatie,
          aard_werkzaamheden:  r.aard_werkzaamheden,
          systeemtype:         r.systeemtype,
          elektrode_type:      r.elektrode_type,
          elektrode_materiaal: r.elektrode_materiaal,
          elektrode_diepte_m:  r.elektrode_diepte_m,
          elektrode_aantal:    r.elektrode_aantal,
          uitvoerder_naam:     r.uitvoerder_naam,
          uitvoerder_erkenning: r.uitvoerder_erkenning,
          datum_uitvoering:    r.datum_uitvoering,
          bevindingen:         r.bevindingen,
          eindconclusie:       r.eindconclusie,
          consent_kalibratie:  r.consent_kalibratie,
          metingen:            m,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaveMsg('Opgeslagen');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setSaveMsg('Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }, [locked]);

  function patch(p: Partial<InspectionReport>) {
    const next = { ...report, ...p };
    setReport(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next, metingen), 1200);
  }

  function patchMeting(index: number, m: Meting) {
    const next = metingen.map((x, i) => i === index ? m : x);
    setMetingen(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(report, next), 1200);
  }

  // Build initial meting list based on systeemtype
  useEffect(() => {
    if (!report.systeemtype || metingen.length > 0) return;
    const stelsel = report.systeemtype as Systeemtype;
    const verplicht = VERPLICHTE_METINGEN[stelsel] ?? [];
    const optioneel = OPTIONELE_METINGEN[stelsel] ?? [];
    const all = [...verplicht, ...optioneel];
    setMetingen(all.map(type => ({
      type,
      waarde: null,
      eenheid: NORM_PARAMS[type].eenheid,
      toetswaarde: NORM_PARAMS[type].defaultToetswaarde,
      pass_fail: null,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.systeemtype, metingen.length]);

  // ── Sign ──────────────────────────────────────────────────────────────────
  const [signNaam, setSignNaam] = useState('');
  const [signErk, setSignErk] = useState('');
  const [signAkkoord, setSignAkkoord] = useState(false);
  const [signConsentDelen, setSignConsentDelen] = useState(false);
  const [signConsentKalib, setSignConsentKalib] = useState(false);
  const [deelEmail, setDeelEmail] = useState(report.deel_ontvanger_email ?? '');
  const [deelNaam, setDeelNaam] = useState(report.deel_ontvanger_naam ?? '');

  async function handleSign() {
    setError('');
    if (!signNaam.trim() || !signErk.trim() || !signAkkoord) {
      setError('Vul naam, erkenning in en zet een vinkje bij de verklaring.');
      return;
    }
    setSigning(true);
    try {
      const res = await fetch(`/api/rapport/${report.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naam:               signNaam.trim(),
          erkenning:          signErk.trim(),
          akkoord:            true,
          consent_delen:      signConsentDelen,
          consent_kalibratie: signConsentKalib,
          deel_ontvanger_email: signConsentDelen && deelEmail ? deelEmail : undefined,
          deel_ontvanger_naam:  signConsentDelen && deelNaam ? deelNaam : undefined,
          deel_pdf:             report.deel_pdf ?? true,
          deel_json:            report.deel_json ?? false,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error);
      setReport(prev => ({
        ...prev,
        status:               'ondertekend',
        conformiteit_naam:    signNaam,
        conformiteit_erkenning: signErk,
        conformiteit_datum:   new Date().toISOString(),
        conformiteit_akkoord: true,
      }));
      setStap('delen');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ondertekening mislukt');
    } finally {
      setSigning(false);
    }
  }

  // ── PDF download ──────────────────────────────────────────────────────────
  async function downloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/rapport/${report.id}/pdf`, { method: 'POST' });
      if (res.headers.get('Content-Type')?.includes('application/pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `opleverrapport-${report.id}.pdf`;
        a.click();
      } else {
        const d = await res.json() as { pdfUrl?: string };
        if (d.pdfUrl) window.open(d.pdfUrl, '_blank');
      }
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Bevindingen ───────────────────────────────────────────────────────────
  const bevindingen = (report.bevindingen ?? []) as Bevinding[];

  function addBevinding() {
    const next: Bevinding = {
      id: crypto.randomUUID(),
      nummer: bevindingen.length + 1,
      omschrijving: '',
      prioriteit: 'B',
    };
    patch({ bevindingen: [...bevindingen, next] });
  }

  function updateBevinding(id: string, partial: Partial<Bevinding>) {
    patch({
      bevindingen: bevindingen.map(b => b.id === id ? { ...b, ...partial } : b),
    });
  }

  function removeBevinding(id: string) {
    const next = bevindingen.filter(b => b.id !== id).map((b, i) => ({ ...b, nummer: i + 1 }));
    patch({ bevindingen: next });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const scanCtx = report.scan_context ?? {};

  return (
    <div className="flex flex-col gap-4">

      {/* Status banner */}
      {locked && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/8 px-4 py-3 flex items-center gap-3">
          <span className="text-green-400 text-lg">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-400">Rapport ondertekend en vergrendeld</p>
            <p className="text-xs text-white/60">Ondertekend door {report.conformiteit_naam} op {report.conformiteit_datum ? new Date(report.conformiteit_datum).toLocaleString('nl-NL') : '—'}</p>
          </div>
        </div>
      )}

      {/* Autosave indicator */}
      <div className="flex items-center justify-between">
        <h1 className="font-condensed text-2xl font-black text-white">
          Opleverrapport
        </h1>
        <span className={`text-[11px] ${saving ? 'text-white/60' : saveMsg === 'Opgeslagen' ? 'text-green-400' : saveMsg ? 'text-red-400' : 'text-white/70'}`}>
          {saving ? 'Opslaan…' : saveMsg || (locked ? 'Vergrendeld' : 'Concept')}
        </span>
      </div>

      <StapNav stap={stap} setStap={setStap} locked={locked} />

      {/* ── Stap 1: Algemene gegevens ─────────────────────────────────────── */}
      {stap === 'algemeen' && (
        <div className="space-y-4">
          {/* Scan context (read-only) */}
          {Object.keys(scanCtx).length > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-blue-400">
                Scan-context — indicatief, o.b.v. BRO-bodemdata (postcodeniveau)
              </p>
              <p className="mb-3 text-[10px] text-white/70">
                Lokale bodem kan afwijken. Definitieve aardingsweerstand wordt op locatie gemeten.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {!!(scanCtx as Record<string, unknown>).rho && (
                  <><span className="text-white/60">Bodemweerstand ρ</span><span className="text-white font-semibold">{String((scanCtx as Record<string, unknown>).rho)} Ω·m</span></>
                )}
                {!!(scanCtx as Record<string, unknown>).voorspeld_diepte_m && (
                  <><span className="text-white/60">Richtdiepte (indicatief)</span><span className="text-white font-semibold">{String((scanCtx as Record<string, unknown>).voorspeld_diepte_m)} m</span></>
                )}
                {!!(scanCtx as Record<string, unknown>).risicoklasse && (
                  <><span className="text-white/60">Risicoklasse</span><span className="text-white font-semibold">Klasse {String((scanCtx as Record<string, unknown>).risicoklasse)}</span></>
                )}
              </div>
            </div>
          )}

          <SectionCard title="Opdrachtgever & locatie">
            <Field label="Opdrachtgever" required>
              <Input value={report.opdrachtgever ?? ''} onChange={v => patch({ opdrachtgever: v })} placeholder="Naam opdrachtgever / eigenaar" disabled={locked} />
            </Field>
            <Field label="Locatie / adres" required>
              <Input value={report.locatie ?? ''} onChange={v => patch({ locatie: v })} placeholder="Straat, huisnummer, postcode" disabled={locked} />
            </Field>
            <Field label="Soort installatie">
              <Input value={report.soort_installatie ?? ''} onChange={v => patch({ soort_installatie: v })} placeholder="Bijv. woning, utiliteit, industrieel" disabled={locked} />
            </Field>
            <Field label="Aard werkzaamheden">
              <Select
                value={report.aard_werkzaamheden ?? ''}
                onChange={v => patch({ aard_werkzaamheden: v as typeof report.aard_werkzaamheden })}
                options={[
                  { value: 'nieuw', label: 'Nieuw' },
                  { value: 'wijziging', label: 'Wijziging' },
                  { value: 'uitbreiding', label: 'Uitbreiding' },
                ]}
                placeholder="Selecteer type"
                disabled={locked}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Netwerkstelsel">
            <Field label="Systeemtype" required hint="Bepaalt welke metingen verplicht zijn">
              <Select
                value={report.systeemtype ?? ''}
                onChange={v => {
                  setMetingen([]);
                  patch({ systeemtype: v as Systeemtype });
                }}
                options={[
                  { value: 'TT',     label: 'TT — (Hollands) aardlek gebruikelijk' },
                  { value: 'TN-S',   label: 'TN-S — gescheiden N en PE' },
                  { value: 'TN-C-S', label: 'TN-C-S — PEN + scheiding bij verdeler' },
                  { value: 'IT',     label: 'IT — geïsoleerd net' },
                ]}
                placeholder="Selecteer stelsel"
                disabled={locked}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Aardelektrode">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type elektrode" required>
                <Select
                  value={report.elektrode_type ?? ''}
                  onChange={v => patch({ elektrode_type: v })}
                  options={[
                    { value: 'pen',            label: 'Aardpen / staaf' },
                    { value: 'plaat',          label: 'Aardplaat' },
                    { value: 'fundatieaarder', label: 'Fundatie-aarder' },
                    { value: 'lint',           label: 'Aardlint' },
                    { value: 'anders',         label: 'Anders' },
                  ]}
                  placeholder="Selecteer type"
                  disabled={locked}
                />
              </Field>
              <Field label="Materiaal">
                <Select
                  value={report.elektrode_materiaal ?? ''}
                  onChange={v => patch({ elektrode_materiaal: v })}
                  options={[
                    { value: 'koper',   label: 'Koper' },
                    { value: 'staal',   label: 'Staal verzinkt' },
                    { value: 'rvs',     label: 'RVS' },
                    { value: 'anders',  label: 'Anders' },
                  ]}
                  placeholder="Selecteer"
                  disabled={locked}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Installatiediepte (m)" required>
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={report.elektrode_diepte_m ?? ''}
                  onChange={v => patch({ elektrode_diepte_m: v === '' ? null : parseFloat(v) })}
                  placeholder="bijv. 6.0"
                  disabled={locked}
                />
              </Field>
              <Field label="Aantal elektroden">
                <Input
                  type="number" step="1" min="1"
                  value={report.elektrode_aantal ?? 1}
                  onChange={v => patch({ elektrode_aantal: parseInt(v) || 1 })}
                  disabled={locked}
                />
              </Field>
            </div>
          </SectionCard>

          {/* KLIC-melding koppelen */}
          <KlicWidget
            rapportId={report.id}
            initialKlicId={report.klic_melding_id}
          />

          <SectionCard title="Uitvoerder">
            <Field label="Naam installateur" required>
              <Input value={report.uitvoerder_naam ?? ''} onChange={v => patch({ uitvoerder_naam: v })} placeholder="Voor- en achternaam" disabled={locked} />
            </Field>
            <Field label="Erkenning / certificaatnummer" required>
              <Input value={report.uitvoerder_erkenning ?? ''} onChange={v => patch({ uitvoerder_erkenning: v })} placeholder="Bijv. E-12345" disabled={locked} />
            </Field>
            <Field label="Datum uitvoering" required>
              <Input type="date" value={report.datum_uitvoering ?? ''} onChange={v => patch({ datum_uitvoering: v })} disabled={locked} />
            </Field>
          </SectionCard>

          <button
            onClick={() => setStap('metingen')}
            className="w-full rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
          >
            Verder naar metingen →
          </button>
        </div>
      )}

      {/* ── Stap 2: Metingen ──────────────────────────────────────────────── */}
      {stap === 'metingen' && (
        <div className="space-y-4">
          {!report.systeemtype && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-sm text-orange-300">
              Selecteer eerst het systeemtype in stap 1 om te zien welke metingen verplicht zijn.
            </div>
          )}

          {report.systeemtype && metingen.length === 0 && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-8 text-center text-sm text-white/60">
              Geen metingen gevonden. Sla stap 1 op en open stap 2 opnieuw.
            </div>
          )}

          {metingen.map((m, i) => (
            <MetingRow
              key={m.type}
              meting={m}
              systeemtype={report.systeemtype as Systeemtype}
              onChange={updated => patchMeting(i, updated)}
              locked={locked}
            />
          ))}

          {report.systeemtype && metingen.length > 0 && (
            <button
              onClick={() => save(report, metingen)}
              disabled={saving || locked}
              className="w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-white/60 hover:border-white/20 hover:text-white transition-colors disabled:opacity-30"
            >
              {saving ? 'Opslaan…' : 'Metingen opslaan'}
            </button>
          )}

          <button
            onClick={() => setStap('bevindingen')}
            className="w-full rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
          >
            Verder naar bevindingen →
          </button>
        </div>
      )}

      {/* ── Stap 3: Bevindingen & conclusie ──────────────────────────────── */}
      {stap === 'bevindingen' && (
        <div className="space-y-4">
          <SectionCard title="Bevindingen / tekortkomingen">
            {bevindingen.length === 0 && !locked && (
              <p className="text-sm text-white/60">Geen bevindingen — klik op &apos;Toevoegen&apos; als er tekortkomingen zijn.</p>
            )}

            {bevindingen.map(b => (
              <div key={b.id} className="rounded-xl border border-white/8 bg-white/2 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white/70">#{b.nummer}</span>
                  <Select
                    value={b.prioriteit}
                    onChange={v => updateBevinding(b.id, { prioriteit: v as BevindingPrioriteit })}
                    options={[
                      { value: 'A', label: 'A — Direct herstellen' },
                      { value: 'B', label: 'B — Binnen afgesproken termijn' },
                      { value: 'C', label: 'C — Aanbeveling' },
                    ]}
                    disabled={locked}
                  />
                  {!locked && (
                    <button onClick={() => removeBevinding(b.id)} className="ml-auto text-white/70 hover:text-red-400 text-lg leading-none">×</button>
                  )}
                </div>
                <Textarea
                  value={b.omschrijving}
                  onChange={v => updateBevinding(b.id, { omschrijving: v })}
                  placeholder="Beschrijf de tekortkoming…"
                  rows={2}
                />
              </div>
            ))}

            {!locked && (
              <button
                onClick={addBevinding}
                className="w-full rounded-xl border border-dashed border-white/15 py-3 text-sm text-white/60 hover:border-white/30 hover:text-white transition-colors"
              >
                + Bevinding toevoegen
              </button>
            )}

            <div className="rounded-xl border border-white/6 bg-white/2 p-3 text-[10px] text-white/60">
              Prioriteit A = direct herstellen · B = binnen afgesproken termijn · C = aanbeveling
            </div>
          </SectionCard>

          <SectionCard title="Eindconclusie">
            <Field label="Conclusie installateur" hint="Formuleer de conclusie zelf; EarthGND oordeelt niet over normconformiteit.">
              <Textarea
                value={report.eindconclusie ?? ''}
                onChange={v => patch({ eindconclusie: v })}
                placeholder="Bijv.: De aardingsinstallatie is geïnspecteerd. De aardverspreidingsweerstand voldoet aan de gestelde eis. Geen tekortkomingen geconstateerd."
                rows={4}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Toestemming voor modelleren (AVG)">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="consent_kalibratie"
                checked={report.consent_kalibratie ?? false}
                onChange={e => patch({ consent_kalibratie: e.target.checked })}
                disabled={locked}
                className="mt-1 h-4 w-4 accent-[#E8761A]"
              />
              <label htmlFor="consent_kalibratie" className="text-sm text-white/70">
                Ik geef toestemming voor het geanonimiseerd gebruik van de meetdata
                (gemeten Ra vs. voorspelde richtdiepte) ter verbetering van het EarthGND-model.
                Er worden geen persoonsgegevens of klantgegevens opgenomen in de dataset.
              </label>
            </div>
          </SectionCard>

          <button
            onClick={() => setStap('ondertekening')}
            className="w-full rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
          >
            Verder naar ondertekening →
          </button>
        </div>
      )}

      {/* ── Stap 4: Ondertekening ─────────────────────────────────────────── */}
      {stap === 'ondertekening' && (
        <div className="space-y-4">
          {!locked ? (
            <>
              {/* Summary */}
              <div className="rounded-2xl border border-white/8 bg-[#111] p-5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70 mb-3">Samenvatting rapport</p>
                {[
                  ['Locatie',     report.locatie],
                  ['Opdrachtgever', report.opdrachtgever],
                  ['Systeemtype', report.systeemtype],
                  ['Elektrode',   `${report.elektrode_type ?? '—'} · ${report.elektrode_diepte_m ?? '—'} m`],
                  ['Datum',       report.datum_uitvoering],
                  ['Metingen',    `${metingen.filter(m => m.waarde != null).length} / ${metingen.length} ingevuld`],
                  ['Bevindingen', `${bevindingen.length} stuks`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-white/60">{k}</span>
                    <span className="text-white font-medium">{v || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Disclaimer */}
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
                <p className="text-xs font-semibold text-orange-300 mb-2">Verantwoordelijkheidsverklaring</p>
                <p className="text-[11px] text-white/70 leading-relaxed">
                  EarthGND levert uitsluitend een digitale werkomgeving en rekenhulp. De onderstaande
                  conformiteitsverklaring is uw eigen professionele verklaring. U bent als installateur
                  volledig verantwoordelijk voor de juistheid van de ingevoerde meetwaarden en voor de
                  beoordeling of de installatie voldoet aan NEN 1010. Door te ondertekenen stelt u dit
                  vast op basis van uw eigen vakkennis en metingen.
                </p>
              </div>

              <SectionCard title="Uw gegevens">
                <Field label="Naam installateur" required>
                  <Input value={signNaam} onChange={setSignNaam} placeholder="Volledige naam" />
                </Field>
                <Field label="Erkenning / certificaatnummer" required>
                  <Input value={signErk} onChange={setSignErk} placeholder="Bijv. E-12345" />
                </Field>
              </SectionCard>

              <SectionCard title="Automatisch delen (optioneel)">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="consentDelen"
                    checked={signConsentDelen}
                    onChange={e => setSignConsentDelen(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#E8761A]"
                  />
                  <label htmlFor="consentDelen" className="text-sm text-white/70">
                    Ik geef toestemming om dit rapport na ondertekening automatisch te delen met de onderstaande ontvanger (AVG-grondslag: uitvoering overeenkomst).
                  </label>
                </div>
                {signConsentDelen && (
                  <div className="space-y-3 pt-1">
                    <Field label="Naam ontvanger">
                      <Input value={deelNaam} onChange={setDeelNaam} placeholder="Bijv. opdrachtgever of keuringsbedrijf" />
                    </Field>
                    <Field label="E-mailadres ontvanger" required>
                      <Input type="email" value={deelEmail} onChange={setDeelEmail} placeholder="naam@bedrijf.nl" />
                    </Field>
                    <div className="flex gap-4 text-sm text-white/60">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={report.deel_pdf ?? true} onChange={e => patch({ deel_pdf: e.target.checked })} className="accent-[#E8761A]" />
                        PDF meesturen
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={report.deel_json ?? false} onChange={e => patch({ deel_json: e.target.checked })} className="accent-[#E8761A]" />
                        JSON meesturen
                      </label>
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Kalibratie (optioneel)">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="consentKalib"
                    checked={signConsentKalib}
                    onChange={e => setSignConsentKalib(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#E8761A]"
                  />
                  <label htmlFor="consentKalib" className="text-sm text-white/70">
                    Ik geef toestemming voor geanonimiseerd hergebruik van meetdata ter verbetering van EarthGND. Geen persoonsgegevens.
                  </label>
                </div>
              </SectionCard>

              {/* Conformiteitsverklaring */}
              <div className="rounded-2xl border border-[#E8761A]/30 bg-[#E8761A]/5 p-5">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="akkoord"
                    checked={signAkkoord}
                    onChange={e => setSignAkkoord(e.target.checked)}
                    className="mt-1 h-5 w-5 accent-[#E8761A]"
                  />
                  <label htmlFor="akkoord" className="text-sm text-white/80 leading-relaxed">
                    <strong className="text-white">Conformiteitsverklaring:</strong> Ik verklaar dat ik
                    de aardingsinstallatie heb geïnspecteerd, de meetwaarden naar waarheid heb vastgesteld,
                    en dat deze installatie naar mijn oordeel als erkend installateur voldoet aan de
                    gestelde eisen conform NEN 1010 deel 6. Ik neem hiervoor volledige verantwoordelijkheid.
                  </label>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
              )}

              <button
                onClick={handleSign}
                disabled={signing || !signAkkoord || !signNaam.trim() || !signErk.trim()}
                className="w-full rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-30 transition-colors"
              >
                {signing ? 'Ondertekenen…' : 'Rapport ondertekenen & vergrendelen'}
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 space-y-3">
              <p className="text-sm font-semibold text-green-400">Rapport is ondertekend</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-white/60">Naam</span><span className="text-white">{report.conformiteit_naam}</span></div>
                <div className="flex justify-between"><span className="text-white/60">Erkenning</span><span className="text-white">{report.conformiteit_erkenning}</span></div>
                <div className="flex justify-between"><span className="text-white/60">Op</span><span className="text-white">{report.conformiteit_datum ? new Date(report.conformiteit_datum).toLocaleString('nl-NL') : '—'}</span></div>
              </div>
              <button
                onClick={() => setStap('delen')}
                className="w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-white hover:border-white/25 transition-colors"
              >
                Naar PDF downloaden & delen →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Stap 5: Delen & export ────────────────────────────────────────── */}
      {stap === 'delen' && (
        <div className="space-y-4">
          {locked && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-xs text-green-400">
              Rapport ondertekend op {report.conformiteit_datum ? new Date(report.conformiteit_datum).toLocaleString('nl-NL') : '—'}
            </div>
          )}

          <SectionCard title="Exporteren">
            <button
              onClick={downloadPdf}
              disabled={pdfLoading}
              className="w-full rounded-xl bg-[#E8761A] py-4 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
            >
              {pdfLoading ? 'PDF genereren…' : 'PDF downloaden'}
            </button>
            <p className="text-[10px] text-white/60 text-center">
              A4-formaat · NEN 1010 deel 6 layout · Inclusief scan-context, metingen en handtekening
            </p>
          </SectionCard>

          {report.deel_status && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              report.deel_status === 'verzonden'
                ? 'border-green-500/20 bg-green-500/5 text-green-400'
                : 'border-orange-500/20 bg-orange-500/5 text-orange-300'
            }`}>
              {report.deel_status === 'verzonden'
                ? `Rapport verzonden naar ${report.deel_ontvanger_email} op ${report.deel_verzonden_op ? new Date(report.deel_verzonden_op).toLocaleString('nl-NL') : '—'}`
                : `Status delen: ${report.deel_status}`
              }
            </div>
          )}

          <div className="rounded-xl border border-white/6 bg-white/2 p-4 text-[10px] text-white/60 leading-relaxed">
            EarthGND levert deze PDF als rekenhulp. De conformiteitsverklaring is de professionele
            verklaring van de ondertekenende installateur. EarthGND aanvaardt geen aansprakelijkheid
            voor normconformiteit of juistheid van de meetwaarden.
          </div>
        </div>
      )}
    </div>
  );
}
