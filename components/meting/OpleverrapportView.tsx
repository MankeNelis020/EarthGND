'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { MetingKoppelenPanel } from '@/components/meting/MetingKoppelenPanel';
import type { UserProfileSettings } from '@/lib/profile';

interface SoilEvidencePoint {
  depthM: number;
  ra: number | null;
  rhoApparent: number;
  zone: string;
  dominantLabel: string;
  dominantProb: number;
}

interface SoilSegment {
  fromDepthM: number;
  toDepthM: number;
  deltaRa: number;
  ohmPerMeter: number;
  rhoAtToDepth: number;
  dominantLabel: string;
}

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
  drijfmethode: string | null;
  rods: { rod_number: number; installed_depth: number; achieved_ra: number }[] | null;
  aantal_pennen: number | null;
  notes: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
}

interface Calc {
  id: string;
  postcode: string | null;
  rapport_naam: string | null;
  result: { dimension?: number; achievedResistance?: number } | null;
  input_values: { electrodeType?: string; targetResistance?: number; rho?: number; groundwaterDepth?: number; drijfmethode?: string } | null;
  created_at?: string;
}

interface Props {
  uuid:         string;
  calc:         Calc;
  meting:       Meting | null;
  isCalculator: boolean;
  profile?:     Pick<UserProfileSettings, 'company_name' | 'logo_url' | 'installateur_naam' | 'installateur_erkenning'> | null;
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

export function OpleverrapportView({ uuid, calc, meting, isCalculator, profile }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [soilPoints, setSoilPoints] = useState<SoilEvidencePoint[]>([]);
  const [soilSegments, setSoilSegments] = useState<SoilSegment[]>([]);
  const [soilGw, setSoilGw] = useState<number | null>(null);
  const [soilExpanded, setSoilExpanded] = useState(false);
  const [showSwitcher, setShowSwitcher]   = useState(false);
  const [nenLoading, setNenLoading]       = useState(false);
  const [nenCreating, setNenCreating]     = useState(false);
  const [nenInfo, setNenInfo]             = useState<{
    canCreate: boolean;
    reason: string | null;
    existingReport: { id: string; status: string } | null;
  } | null>(null);

  const input     = calc.input_values as Calc['input_values'];
  const resultaat = calc.result       as Calc['result'];
  const status    = meting?.status ?? 'draft';

  useEffect(() => {
    if (!meting?.depth_curve?.length) return;
    if (status !== 'submitted' && status !== 'confirmed') return;
    fetch(`/api/meting/${uuid}/evidence`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setSoilPoints(data.points ?? []);
        setSoilSegments(data.segments ?? []);
        setSoilGw(data.gwDepthM ?? null);
      })
      .catch(() => {});
  }, [uuid, meting?.depth_curve, status]);

  useEffect(() => {
    if (!isCalculator) return;
    setNenLoading(true);
    fetch(`/api/rapport/from-pendiepte/${uuid}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setNenInfo(data as typeof nenInfo);
      })
      .catch(() => {})
      .finally(() => setNenLoading(false));
  }, [uuid, isCalculator, status]);

  async function handleCreateNenReport() {
    setNenCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/rapport/from-pendiepte/${uuid}`, { method: 'POST' });
      const data = await res.json() as { reportId?: string; error?: string };
      if (!res.ok || !data.reportId) {
        setError(data.error ?? 'NEN 1010-rapport aanmaken mislukt');
        return;
      }
      router.push(`/${locale}/rapport/${data.reportId}`);
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setNenCreating(false);
    }
  }

  // Inline rename state
  const [naam, setNaam]           = useState(calc.rapport_naam ?? '');
  const [editingNaam, setEditing] = useState(false);
  const [naamSaving, setNaamSaving] = useState(false);

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
      const res  = await fetch(`/api/meting/${uuid}/confirm`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Bevestigen mislukt'); setConfirming(false); return; }
      // Navigate to dashboard so the user sees the confirmed item in Opleverrapporten
      router.push(`/${locale}/dashboard`);
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
      setConfirming(false);
    }
  }

  // ── Identity helpers ──────────────────────────────────────────────────────
  const identityPostcode = meting?.postcode ?? calc.postcode ?? null;
  const identityDateRaw  = meting?.confirmed_at ?? meting?.submitted_at ?? calc.created_at ?? null;
  const identityDate     = identityDateRaw
    ? new Date(identityDateRaw).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const identityShortId  = `#${uuid.slice(0, 8)}`;
  const identityLine     = [identityPostcode, identityDate, identityShortId].filter(Boolean).join(' · ');

  // Default title when no custom name: street+nr or postcode
  const locationTitle = meting?.straatnaam
    ? `${meting.straatnaam}${meting.huisnummer ? ` ${meting.huisnummer}` : ''}${meting.postcode ? `, ${meting.postcode}` : ''}`
    : (identityPostcode ?? 'Pendiepte meting');

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">Opleverrapport · Pendiepte</p>

          {/* Editable name (only when calculator + not yet confirmed) */}
          {isCalculator && editingNaam ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                autoFocus
                value={naam}
                onChange={e => setNaam(e.target.value)}
                onBlur={saveNaam}
                onKeyDown={e => { if (e.key === 'Enter') saveNaam(); if (e.key === 'Escape') setEditing(false); }}
                disabled={naamSaving}
                placeholder={locationTitle}
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
                {calc.rapport_naam ?? locationTitle}
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

          {/* Identity line — always visible */}
          <p className="mt-1 font-mono text-[11px] text-white/35 tracking-tight">{identityLine}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Installateur — auto from profile + calc context */}
      {(profile?.installateur_naam || profile?.company_name || profile?.logo_url) && (
        <div className="flex items-start gap-4 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          {profile.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo_url} alt="" className="h-10 max-w-[120px] object-contain" />
          )}
          <div className="min-w-0 text-sm">
            {profile.company_name && <p className="font-semibold text-white">{profile.company_name}</p>}
            {profile.installateur_naam && (
              <p className="text-white/70">Installateur: {profile.installateur_naam}</p>
            )}
            {profile.installateur_erkenning && (
              <p className="text-white/45 text-xs">Erkenning: {profile.installateur_erkenning}</p>
            )}
          </div>
        </div>
      )}

      {/* Auto-filled locatie summary */}
      <div className="rounded-xl border border-white/8 bg-[#111] px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Locatie &amp; berekening</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="text-white/80">
            <span className="text-white/40">Adres: </span>
            {meting?.straatnaam
              ? [meting.straatnaam, meting.huisnummer, meting.postcode, meting.woonplaats].filter(Boolean).join(' ')
              : calc.postcode ?? '—'}
          </p>
          <p className="text-white/80">
            <span className="text-white/40">Doelweerstand: </span>
            ≤ {input?.targetResistance ?? '—'} Ω
          </p>
          <p className="text-white/80">
            <span className="text-white/40">Berekende diepte: </span>
            {fmt(resultaat?.dimension, 'm')}
          </p>
          <p className="text-white/80">
            <span className="text-white/40">Bodem ρ (calc): </span>
            {input?.rho != null ? `${input.rho} Ω·m` : '—'}
          </p>
        </div>
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
            label: 'Drijfmethode',
            berekend: input?.drijfmethode ?? '—',
            gemeten:  meting?.drijfmethode ?? '—',
          },
          {
            label: (meting?.aantal_pennen ?? 1) > 1 ? 'Gecombineerde Ra — doelweerstand' : 'Doelweerstand',
            berekend: `≤ ${input?.targetResistance ?? '—'} Ω`,
            gemeten:  meting?.achieved_ra != null ? `${meting.achieved_ra.toFixed(2)} Ω` : '—',
            highlight: meting?.achieved_ra != null && input?.targetResistance != null
              ? meting.achieved_ra <= input.targetResistance ? 'pass' : 'fail'
              : undefined,
          },
          {
            label: 'Diepte (pen 1)',
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

      {/* Per-rod measurements (multi-rod only) */}
      {(meting?.rods?.length ?? 0) > 1 && (
        <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
          <div className="border-b border-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Meting per pen — {meting?.rods?.length} pennen geplaatst
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {(meting?.rods ?? []).map(rod => (
              <div key={rod.rod_number} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-12 shrink-0 text-xs font-semibold text-white/60">Pen {rod.rod_number}</span>
                <span className="w-20 text-sm text-white">{rod.installed_depth?.toFixed(2) ?? '—'} m</span>
                <span className="text-sm font-semibold text-[#E8761A]">{rod.achieved_ra?.toFixed(2) ?? '—'} Ω</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {(() => {
              const maxRa = Math.max(...meting.depth_curve.map(pt => pt.ra), 1);
              return meting.depth_curve.map((pt, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                  <span className="w-16 text-sm text-white/60">{pt.depth} m</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-[#E8761A]/60"
                      style={{ width: `${Math.min((pt.ra / maxRa) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-semibold text-white">{pt.ra} Ω</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Bodemanalyse — collapsed by default */}
      {soilPoints.length > 0 && (
        <details
          open={soilExpanded}
          onToggle={e => setSoilExpanded((e.target as HTMLDetailsElement).open)}
          className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden"
        >
          <summary className="cursor-pointer border-b border-white/8 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/60">
            Bodemanalyse (detail) — {soilPoints.length} punten
            {soilGw != null && <span className="ml-2 normal-case text-white/35">GWT {soilGw} m</span>}
          </summary>
          <div className="divide-y divide-white/5">
            {soilPoints.map(pt => (
              <div key={pt.depthM} className="grid grid-cols-2 gap-2 px-4 py-2.5 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] text-white/40">Diepte</p>
                  <p className="text-sm text-white">{pt.depthM} m</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">ρ schijnbaar</p>
                  <p className="text-sm font-semibold text-[#E8761A]">{pt.rhoApparent} Ω·m</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">Grondtype</p>
                  <p className="text-sm text-white capitalize">{pt.dominantLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">Zone</p>
                  <p className="text-sm text-white/70">{pt.zone === 'wet' ? 'nat' : 'droog'}</p>
                </div>
              </div>
            ))}
          </div>
          {soilSegments.length > 0 && (
            <div className="border-t border-white/8 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Ω-daling per segment</p>
              <div className="flex flex-col gap-1.5">
                {soilSegments.map((seg, i) => (
                  <p key={i} className="text-xs text-white/70">
                    {seg.fromDepthM}→{seg.toDepthM} m: {seg.ohmPerMeter > 0 ? '+' : ''}{seg.ohmPerMeter} Ω/m → {seg.dominantLabel}
                  </p>
                ))}
              </div>
            </div>
          )}
        </details>
      )}

      {/* Notes */}
      {meting?.notes && (
        <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">Opmerkingen</p>
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
            Controleer de meetwaarden. Na bevestiging worden de waarden vergrendeld
            en kunt u het rapport als opleverrapport gebruiken conform NEN 3140.
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
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <p className="text-sm font-semibold text-green-400">Veldmeting bevestigd</p>
          <p className="mt-1 text-xs text-white/60">
            Berekening en meetgegevens zijn gekoppeld. U kunt dit rapport gebruiken of een NEN 1010-opleverrapport starten.
          </p>

          {isCalculator && !nenLoading && nenInfo && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              {nenInfo.existingReport ? (
                <a
                  href={`/${locale}/rapport/${nenInfo.existingReport.id}`}
                  className="inline-flex justify-center rounded-xl border border-[#E8761A]/40 bg-[#E8761A]/10 px-5 py-2.5 text-sm font-bold text-[#E8761A] hover:bg-[#E8761A]/20 transition-colors"
                >
                  Open NEN 1010-rapport ({nenInfo.existingReport.status === 'ondertekend' ? 'ondertekend' : 'concept'})
                </a>
              ) : nenInfo.canCreate ? (
                <button
                  type="button"
                  onClick={handleCreateNenReport}
                  disabled={nenCreating}
                  className="inline-flex justify-center rounded-xl bg-[#E8761A] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
                >
                  {nenCreating ? 'Aanmaken…' : 'Maak NEN 1010-opleverrapport →'}
                </button>
              ) : nenInfo.reason ? (
                <p className="text-xs text-white/45">{nenInfo.reason}</p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* No meting yet — prompt to invite monteur */}
      {isCalculator && !meting && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-white/10 bg-white/3 p-6 text-center">
            <p className="mb-1 text-sm font-semibold text-white/70">Nog geen veldmeting gekoppeld</p>
            <p className="mb-4 text-xs text-white/40 leading-relaxed">
              Nodig een installateur uit via de Pendiepte Calculator, of koppel een bestaande berekening hieronder.
            </p>
            <a
              href="/tool/diepte"
              className="inline-block rounded-lg border border-[#E8761A]/30 bg-[#E8761A]/10 px-4 py-2 text-xs font-semibold text-[#E8761A] hover:bg-[#E8761A]/20 transition-colors"
            >
              Naar Pendiepte Calculator
            </a>
          </div>
          <MetingKoppelenPanel locale={locale} currentCalculationId={uuid} />
        </div>
      )}

      {/* Calculator: switch to another veldmeting */}
      {isCalculator && meting && (
        <div className="border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={() => setShowSwitcher(v => !v)}
            className="text-xs font-semibold text-white/40 hover:text-[#E8761A] transition-colors"
          >
            {showSwitcher ? 'Verberg lijst ▲' : 'Andere veldmeting kiezen ▼'}
          </button>
          {showSwitcher && (
            <div className="mt-3">
              <MetingKoppelenPanel locale={locale} currentCalculationId={uuid} compact />
            </div>
          )}
        </div>
      )}

      {/* Meting invited but not yet submitted */}
      {isCalculator && meting && status === 'invited' && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center">
          <p className="text-sm text-blue-400">Wachten op installateur</p>
          <p className="mt-1 text-xs text-white/50">
            De uitnodiging is verstuurd naar {meting.monteur_email ?? 'de installateur'}.
            U ontvangt een e-mail zodra de meting is ingediend.
          </p>
        </div>
      )}
    </div>
  );
}
