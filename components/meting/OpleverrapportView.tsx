'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Meting {
  id: string;
  status: string;
  monteur_email: string | null;
  lat: number | null;
  lon: number | null;
  gps_accuracy_m: number | null;
  postcode: string | null;
  straatnaam: string | null;
  huisnummer: string | null;
  woonplaats: string | null;
  depth_curve: { depth: number; ra: number }[];
  achieved_ra: number | null;
  installed_depth: number | null;
  electrode_type: string | null;
  notes: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
}

interface Calc {
  id: string;
  postcode: string | null;
  risicoklasse: string | null;
  rapport_naam: string | null;
  resultaat: { dimension?: number; achievedResistance?: number } | null;
  input: { electrodeType?: string; targetResistance?: number; rho?: number; groundwaterDepth?: number } | null;
  created_at?: string;
}

interface Props {
  uuid:         string;
  calc:         Calc;
  meting:       Meting | null;
  isCalculator: boolean;
}

function fmt(v: number | null | undefined, unit = '') {
  if (v == null) return '—';
  return `${v.toFixed(2)}${unit ? ' ' + unit : ''}`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    draft:     { label: 'Concept',          cls: 'border-white/10 bg-white/5 text-white/60' },
    invited:   { label: 'Uitgenodigd',       cls: 'border-blue-500/30 bg-blue-500/5 text-blue-400' },
    submitted: { label: 'Ingediend',         cls: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400' },
    confirmed: { label: 'Bevestigd',         cls: 'border-green-500/30 bg-green-500/5 text-green-400' },
  }[status] ?? { label: status, cls: 'border-white/10 bg-white/5 text-white/60' };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export function OpleverrapportView({ uuid, calc, meting, isCalculator }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  // Inline rename state
  const [naam, setNaam]           = useState(calc.rapport_naam ?? '');
  const [editingNaam, setEditing] = useState(false);
  const [naamSaving, setNaamSaving] = useState(false);

  const input     = calc.input     as Calc['input'];
  const resultaat = calc.resultaat as Calc['resultaat'];
  const status    = meting?.status ?? 'draft';

  async function saveNaam() {
    if (!naam.trim() || naam.trim() === calc.rapport_naam) { setEditing(false); return; }
    setNaamSaving(true);
    try {
      await fetch(`/api/calculations/${uuid}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapport_naam: naam.trim() }),
      });
      router.refresh();
    } finally {
      setNaamSaving(false);
      setEditing(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(`/api/meting/${uuid}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Bevestigen mislukt'); return; }
      router.refresh();
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with editable name */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">Opleverrapport</p>
          {isCalculator && editingNaam ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                autoFocus
                value={naam}
                onChange={e => setNaam(e.target.value)}
                onBlur={saveNaam}
                onKeyDown={e => { if (e.key === 'Enter') saveNaam(); if (e.key === 'Escape') setEditing(false); }}
                disabled={naamSaving}
                className="flex-1 rounded-lg border border-[#E8761A]/40 bg-white/5 px-3 py-1.5 text-lg font-bold text-[#F5EFE6] focus:outline-none focus:border-[#E8761A]"
              />
              <button onClick={saveNaam} disabled={naamSaving}
                className="text-xs text-[#E8761A] hover:text-[#d06510]">
                {naamSaving ? '…' : 'Opslaan'}
              </button>
            </div>
          ) : (
            <div className="group mt-1 flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-[#F5EFE6]">
                {calc.rapport_naam ?? 'Pendiepte meting'}
              </h1>
              {isCalculator && status !== 'confirmed' && (
                <button
                  onClick={() => { setNaam(calc.rapport_naam ?? ''); setEditing(true); }}
                  className="shrink-0 rounded p-1 text-white/20 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white/60"
                  title="Naam wijzigen"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
              )}
            </div>
          )}
          {calc.postcode && <p className="mt-1 text-sm text-white/50">{calc.postcode}</p>}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Side-by-side comparison */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-white/8 border-b border-white/8">
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Berekend</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#E8761A]">Gemeten</p>
          </div>
        </div>

        {[
          {
            label: 'Elektrode type',
            berekend: input?.electrodeType === 'lint' ? 'Horizontaal lint' : 'Verticale pen',
            gemeten:  meting?.electrode_type === 'lint' ? 'Horizontaal lint' : meting?.electrode_type === 'pen' ? 'Verticale pen' : '—',
          },
          {
            label: 'Doelweerstand',
            berekend: `≤ ${input?.targetResistance ?? '—'} Ω`,
            gemeten:  meting?.achieved_ra != null ? `${meting.achieved_ra.toFixed(2)} Ω` : '—',
            highlight: meting?.achieved_ra != null && input?.targetResistance != null
              ? meting.achieved_ra <= input.targetResistance ? 'pass' : 'fail'
              : undefined,
          },
          {
            label: 'Diepte',
            berekend: fmt(resultaat?.dimension, 'm'),
            gemeten:  fmt(meting?.installed_depth, 'm'),
          },
          {
            label: 'Ra berekend / gemeten',
            berekend: fmt(resultaat?.achievedResistance, 'Ω'),
            gemeten:  fmt(meting?.achieved_ra, 'Ω'),
          },
        ].map(row => (
          <div key={row.label} className="grid grid-cols-2 divide-x divide-white/8 border-b border-white/5 last:border-b-0">
            <div className="px-4 py-3">
              <p className="mb-0.5 text-[10px] text-white/40">{row.label}</p>
              <p className="text-sm text-white/80">{row.berekend}</p>
            </div>
            <div className="px-4 py-3">
              <p className="mb-0.5 text-[10px] text-white/40">{row.label}</p>
              <p className={`text-sm font-semibold ${
                row.highlight === 'pass' ? 'text-green-400' :
                row.highlight === 'fail' ? 'text-red-400' :
                'text-[#E8761A]'
              }`}>
                {row.gemeten}
                {row.highlight === 'pass' && <span className="ml-1.5 text-[10px] text-green-400">✓ voldoet</span>}
                {row.highlight === 'fail' && <span className="ml-1.5 text-[10px] text-red-400">✗ overschreden</span>}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* GPS location */}
      {meting?.lat && meting?.lon && (
        <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">GPS-locatie</p>
          <p className="text-sm text-white/80">
            {meting.lat.toFixed(6)}, {meting.lon.toFixed(6)}
            {meting.gps_accuracy_m && <span className="ml-2 text-white/40">± {meting.gps_accuracy_m.toFixed(0)} m</span>}
          </p>
          {(meting.straatnaam || meting.woonplaats) && (
            <p className="mt-0.5 text-xs text-white/60">
              {[meting.straatnaam, meting.huisnummer, meting.postcode, meting.woonplaats].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      )}

      {/* Depth curve table */}
      {meting?.depth_curve && meting.depth_curve.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
          <div className="border-b border-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Dieptecurve</p>
          </div>
          <div className="divide-y divide-white/5">
            {meting.depth_curve.map((pt, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-16 text-sm text-white/60">{pt.depth} m</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[#E8761A]/60"
                    style={{ width: `${Math.min((pt.ra / (meting.depth_curve[0]?.ra || 1)) * 100, 100)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-semibold text-white">{pt.ra} Ω</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {meting?.notes && (
        <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">Opmerkingen monteur</p>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{meting.notes}</p>
        </div>
      )}

      {/* Timestamps */}
      <div className="flex flex-wrap gap-4 text-xs text-white/40">
        {calc.created_at && (
          <span>Berekend: {new Date(calc.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        )}
        {meting?.submitted_at && (
          <span>Meting ingediend: {new Date(meting.submitted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        )}
        {meting?.confirmed_at && (
          <span>Bevestigd: {new Date(meting.confirmed_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        )}
      </div>

      {/* Confirm action (only for calculator, only when submitted) */}
      {isCalculator && status === 'submitted' && (
        <div className="rounded-2xl border border-[#E8761A]/20 bg-[#E8761A]/5 p-5">
          <p className="mb-1 text-sm font-semibold text-[#E8761A]">Meting controleren en bevestigen</p>
          <p className="mb-4 text-xs text-white/60 leading-relaxed">
            Controleer de meetwaarden van de monteur. Na bevestiging worden de waarden vergrendeld en
            kunt u het rapport als opleverrapport gebruiken conform NEN 3140.
            <br/><span className="mt-1 block text-white/40">
              De conformiteitsverklaring wordt ondertekend door de erkende persoon die het werk heeft beoordeeld.
            </span>
          </p>
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
          >
            {confirming ? 'Bevestigen…' : 'Bevestig meting — sluit rapport'}
          </button>
        </div>
      )}

      {status === 'confirmed' && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-center">
          <p className="text-sm font-semibold text-green-400">Rapport bevestigd en vergrendeld</p>
          <p className="mt-1 text-xs text-white/60">
            De meetwaarden zijn gecontroleerd en bevestigd. Dit rapport kan als opleverrapport worden gebruikt.
          </p>
        </div>
      )}

      {/* No meting yet — prompt to invite monteur */}
      {isCalculator && !meting && (
        <div className="rounded-xl border border-white/10 bg-white/3 p-6 text-center">
          <p className="mb-1 text-sm font-semibold text-white/70">Nog geen veldmeting gekoppeld</p>
          <p className="mb-4 text-xs text-white/40 leading-relaxed">
            Ga terug naar de Pendiepte Calculator en gebruik de knop &ldquo;Mail monteur&rdquo; om een veldmeting te koppelen.
          </p>
          <a
            href="/nl/tool/diepte"
            className="inline-block rounded-lg border border-[#E8761A]/30 bg-[#E8761A]/10 px-4 py-2 text-xs font-semibold text-[#E8761A] hover:bg-[#E8761A]/20 transition-colors"
          >
            Naar Pendiepte Calculator
          </a>
        </div>
      )}

      {/* Meting invited but not yet submitted */}
      {isCalculator && meting && status === 'invited' && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center">
          <p className="text-sm text-blue-400">Wachten op monteur</p>
          <p className="mt-1 text-xs text-white/50">
            De uitnodiging is verstuurd naar {meting.monteur_email ?? 'de monteur'}.
            U ontvangt een e-mail zodra de meting is ingediend.
          </p>
        </div>
      )}
    </div>
  );
}
