'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { reverseGeocode, forwardGeocode } from '@/lib/geocoding';
import { DRIVE_METHOD_LABELS, type DriveMethod } from '@/lib/pipeline/driveability';

interface DepthPoint { depth: number; ra: number }
interface RodMeting  { rod_number: number; installed_depth: string; achieved_ra: string }

export interface SavedMeting {
  status:          string;
  lat:             number | null;
  lon:             number | null;
  gps_accuracy_m:  number | null;
  postcode:        string | null;
  straatnaam:      string | null;
  huisnummer:      string | null;
  woonplaats:      string | null;
  depth_curve:     DepthPoint[];
  achieved_ra:     number | null;
  installed_depth: number | null;
  electrode_type:  string | null;
  drijfmethode:    string | null;
  rods:            { rod_number: number; installed_depth: number; achieved_ra: number }[];
  aantal_pennen:   number | null;
  notes:           string | null;
}

interface Props {
  uuid:                      string;
  initialPostcode?:          string;
  initialElectrodeType:      'pen' | 'lint';
  expectedDepth?:            number;
  recommendedAantalPennen?:  number;
  recommendedDrijfmethode?:  string;
  savedMeting?:              SavedMeting | null;
}

function buildInitialCurve(maxDepth: number): DepthPoint[] {
  const rows: DepthPoint[] = [];
  for (let d = 3; d <= Math.ceil(maxDepth) + 3; d += 3) {
    rows.push({ depth: d, ra: 0 });
  }
  return rows;
}

function buildInitialRods(n: number): RodMeting[] {
  return Array.from({ length: n }, (_, i) => ({
    rod_number: i + 1,
    installed_depth: '',
    achieved_ra: '',
  }));
}

const DRIVE_METHODS = Object.keys(DRIVE_METHOD_LABELS) as DriveMethod[];

export function MonteurForm({
  uuid, initialPostcode, initialElectrodeType,
  expectedDepth, recommendedAantalPennen = 1, recommendedDrijfmethode,
  savedMeting,
}: Props) {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'nl';

  const aantalPennen = savedMeting?.aantal_pennen ?? recommendedAantalPennen;
  const isMultiRod   = aantalPennen > 1;

  const hasSaved = !!savedMeting?.lat || (savedMeting?.depth_curve?.length ?? 0) > 0 ||
                   (savedMeting?.rods?.length ?? 0) > 0;

  // ── Location ─────────────────────────────────────────────────────────────
  const [lat, setLat]         = useState<number | null>(savedMeting?.lat ?? null);
  const [lon, setLon]         = useState<number | null>(savedMeting?.lon ?? null);
  const [gpsAccuracy, setAcc] = useState<number | null>(savedMeting?.gps_accuracy_m ?? null);
  const [gpsLoading, setGpsLoading]     = useState(false);
  const [gpsError, setGpsError]         = useState('');
  const [coordsSource, setCoordsSource] = useState<'gps' | 'address' | null>(
    savedMeting?.lat ? 'gps' : null,
  );
  const [geoFilling, setGeoFilling] = useState(false);

  // ── Address ───────────────────────────────────────────────────────────────
  const [postcode,   setPostcode]   = useState(savedMeting?.postcode   ?? initialPostcode ?? '');
  const [straatnaam, setStraatnaam] = useState(savedMeting?.straatnaam ?? '');
  const [huisnummer, setHuisnummer] = useState(savedMeting?.huisnummer ?? '');
  const [woonplaats, setWoonplaats] = useState(savedMeting?.woonplaats ?? '');

  // ── Electrode & drijfmethode ──────────────────────────────────────────────
  const [electrodeType, setElectrodeType] = useState<'pen' | 'lint'>(
    (savedMeting?.electrode_type as 'pen' | 'lint') ?? initialElectrodeType,
  );
  const [drijfmethode, setDrijfmethode] = useState<string>(
    savedMeting?.drijfmethode ?? recommendedDrijfmethode ?? 'sds',
  );

  // ── Single-rod measurements (depth_curve + final) ─────────────────────────
  const [depthCurve, setDepthCurve] = useState<DepthPoint[]>(() => {
    if (savedMeting?.depth_curve?.length) return savedMeting.depth_curve;
    if (expectedDepth) return buildInitialCurve(expectedDepth);
    return [{ depth: 3, ra: 0 }];
  });
  const [achievedRa,     setAchievedRa]     = useState(savedMeting?.achieved_ra?.toString() ?? '');
  const [installedDepth, setInstalledDepth] = useState(
    savedMeting?.installed_depth?.toString() ?? (expectedDepth?.toFixed(2) ?? ''),
  );

  // ── Multi-rod measurements ────────────────────────────────────────────────
  const [rods, setRods] = useState<RodMeting[]>(() => {
    if (savedMeting?.rods?.length) {
      return savedMeting.rods.map(r => ({
        rod_number:      r.rod_number,
        installed_depth: r.installed_depth?.toString() ?? '',
        achieved_ra:     r.achieved_ra?.toString() ?? '',
      }));
    }
    return buildInitialRods(aantalPennen);
  });
  // For multi-rod: combined Ra (measured after all rods are connected in parallel)
  const [combinedRa, setCombinedRa] = useState(
    isMultiRod ? (savedMeting?.achieved_ra?.toString() ?? '') : '',
  );

  // ── Notes ─────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(savedMeting?.notes ?? '');

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const [lastSaved, setLastSaved]   = useState<Date | null>(hasSaved ? new Date() : null);
  const [saveError, setSaveError]   = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [submitting, setSubmitting] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error, setError]           = useState('');

  // ── Refs for geocode stale-closure guard ──────────────────────────────────
  const straatnaamRef = useRef(straatnaam);
  const woonplaatsRef = useRef(woonplaats);
  const fwdTimerRef   = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { straatnaamRef.current = straatnaam; }, [straatnaam]);
  useEffect(() => { woonplaatsRef.current = woonplaats; }, [woonplaats]);

  // ── Forward geocode ───────────────────────────────────────────────────────
  useEffect(() => {
    if (coordsSource === 'gps') return;
    const query = [postcode.trim(), huisnummer.trim()].filter(Boolean).join(' ');
    if (query.length < 4) return;
    clearTimeout(fwdTimerRef.current);
    fwdTimerRef.current = setTimeout(async () => {
      const result = await forwardGeocode(query);
      if (!result) return;
      setLat(result.lat);
      setLon(result.lon);
      setAcc(null);
      setCoordsSource('address');
      if (!straatnaamRef.current && result.straatnaam) setStraatnaam(result.straatnaam);
      if (!woonplaatsRef.current && result.woonplaats) setWoonplaats(result.woonplaats);
    }, 600);
    return () => clearTimeout(fwdTimerRef.current);
  }, [postcode, huisnummer, coordsSource]);

  // ── Payload builder ───────────────────────────────────────────────────────
  function currentPayload() {
    const base = {
      lat, lon, gps_accuracy_m: coordsSource === 'gps' ? gpsAccuracy : null,
      postcode, straatnaam, huisnummer, woonplaats,
      electrode_type: electrodeType,
      drijfmethode:   electrodeType === 'pen' ? drijfmethode : null,
      notes,
    };
    if (isMultiRod && electrodeType === 'pen') {
      const parsedRods = rods.map(r => ({
        rod_number:      r.rod_number,
        installed_depth: r.installed_depth ? Number(r.installed_depth) : null,
        achieved_ra:     r.achieved_ra     ? Number(r.achieved_ra)     : null,
      }));
      const maxDepth = Math.max(0, ...parsedRods.map(r => r.installed_depth ?? 0));
      return {
        ...base,
        rods:            parsedRods,
        achieved_ra:     combinedRa ? Number(combinedRa) : null,
        installed_depth: maxDepth || null,
        depth_curve:     [],
      };
    }
    return {
      ...base,
      depth_curve:     depthCurve,
      achieved_ra:     achievedRa     ? Number(achievedRa)     : null,
      installed_depth: installedDepth ? Number(installedDepth) : null,
      rods:            [],
    };
  }

  function scheduleAutoSave(payload: object) {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/meting/${uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSaveError(!res.ok);
        if (res.ok) setLastSaved(new Date());
      } catch {
        setSaveError(true);
      }
    }, 5000);
  }

  useEffect(() => {
    scheduleAutoSave(currentPayload());
    return () => clearTimeout(autoSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, postcode, straatnaam, huisnummer, woonplaats,
      depthCurve, achievedRa, installedDepth, electrodeType, drijfmethode,
      rods, combinedRa, notes]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  function requestGPS() {
    if (!navigator.geolocation) { setGpsError('Geolocatie niet beschikbaar op dit apparaat.'); return; }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude;
        const newLon = pos.coords.longitude;
        setLat(newLat); setLon(newLon); setAcc(pos.coords.accuracy);
        setCoordsSource('gps'); setGpsLoading(false);
        setGeoFilling(true);
        reverseGeocode(newLat, newLon)
          .then(addr => {
            if (!addr) return;
            setPostcode(addr.postcode ?? '');
            setStraatnaam(addr.straatnaam ?? '');
            setHuisnummer(addr.huisnummer ?? '');
            setWoonplaats(addr.woonplaats ?? '');
          })
          .finally(() => setGeoFilling(false));
      },
      (err) => { setGpsError('Locatie ophalen mislukt: ' + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  // ── Depth curve helpers (single rod) ──────────────────────────────────────
  function addRow() {
    const lastDepth = depthCurve[depthCurve.length - 1]?.depth ?? 0;
    setDepthCurve(prev => [...prev, { depth: lastDepth + 3, ra: 0 }]);
  }
  function removeRow(i: number) {
    setDepthCurve(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: keyof DepthPoint, value: number) {
    setDepthCurve(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  // ── Rod helpers (multi-rod) ───────────────────────────────────────────────
  function updateRod(i: number, field: 'installed_depth' | 'achieved_ra', value: string) {
    setRods(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }
  function addRod() {
    setRods(prev => [...prev, { rod_number: prev.length + 1, installed_depth: '', achieved_ra: '' }]);
  }
  function removeRod(i: number) {
    setRods(prev => prev.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, rod_number: idx + 1 })));
  }

  // ── Save & close ──────────────────────────────────────────────────────────
  async function handleSaveAndClose() {
    clearTimeout(autoSaveTimer.current);
    setSaving(true);
    try {
      await fetch(`/api/meting/${uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPayload()),
      });
    } finally {
      setSaving(false);
      sessionStorage.setItem('skip_pending_redirect', '1');
      window.location.href = `/${locale}/dashboard`;
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lat || !lon) { setError('Locatie is verplicht — gebruik GPS of vul postcode + huisnummer in.'); return; }

    if (isMultiRod && electrodeType === 'pen') {
      const incomplete = rods.some(r => !r.installed_depth || !r.achieved_ra);
      if (incomplete) { setError('Vul diepte en Ra in voor elke pen.'); return; }
      if (!combinedRa) { setError('Gecombineerde Ra is verplicht.'); return; }
    } else {
      if (!achievedRa || !installedDepth) { setError('Eindmeting (Ra en diepte) zijn verplicht.'); return; }
    }

    clearTimeout(autoSaveTimer.current);
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/meting/${uuid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPayload()),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Indienen mislukt'); return; }
      router.refresh();
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Save indicator ────────────────────────────────────────────────────────
  function SavedIndicator() {
    if (saveError) return <span className="text-[10px] text-red-400">⚠ Opslaan mislukt</span>;
    if (!lastSaved) return null;
    const mins = Math.floor((Date.now() - lastSaved.getTime()) / 60000);
    return (
      <span className="text-[10px] text-white/30">
        {mins === 0 ? 'Zojuist opgeslagen' : `Opgeslagen ${mins} min geleden`}
      </span>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {/* Top: save & close + restore banner */}
      <div className="flex items-center justify-between gap-3">
        {hasSaved ? (
          <p className="text-xs text-blue-300">↩ Voortgang hersteld — ga verder waar u was gebleven.</p>
        ) : (
          <p className="text-xs text-white/30">Voortgang wordt automatisch opgeslagen.</p>
        )}
        <button
          type="button" onClick={handleSaveAndClose} disabled={saving || submitting}
          className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-colors"
        >
          {saving ? 'Opslaan…' : '↗ Opslaan & sluiten'}
        </button>
      </div>

      {/* Location */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
            Locatie <span className="text-red-400">*</span>
          </p>
          <SavedIndicator />
        </div>
        {lat && lon ? (
          <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-green-400">
                {coordsSource === 'gps' ? 'GPS-locatie bepaald' : 'Locatie op basis van adres'}
              </p>
              {coordsSource === 'address' && (
                <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-400">
                  Adresschatting — GPS geeft hogere precisie
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-white/60">
              {lat.toFixed(6)}, {lon.toFixed(6)}
              {gpsAccuracy && coordsSource === 'gps' && (
                <span className="ml-2 text-white/40">± {gpsAccuracy.toFixed(0)} m</span>
              )}
            </p>
          </div>
        ) : null}
        {gpsError && <p className="mb-2 text-xs text-red-400">{gpsError}</p>}
        <button
          type="button" onClick={requestGPS} disabled={gpsLoading}
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          {gpsLoading ? (
            <svg className="h-4 w-4 animate-spin text-white/60" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <svg className="h-4 w-4 text-[#E8761A]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a7 7 0 0 1 7 7c0 4.97-7 13-7 13S5 13.97 5 9a7 7 0 0 1 7-7zm0 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
            </svg>
          )}
          {gpsLoading ? 'Locatie bepalen…' : lat ? 'GPS opnieuw bepalen' : 'Gebruik GPS-locatie'}
        </button>
        <p className="mt-2 text-[10px] text-white/40">
          GPS geeft de nauwkeurigste locatie. U kunt ook alleen het adres invullen.
        </p>
      </div>

      {/* Address */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Adres locatie</p>
          {geoFilling && <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-white/60" />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-white/70">Postcode</label>
            <input value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="1234 AB"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-white/70">Woonplaats</label>
            <input value={woonplaats} onChange={e => setWoonplaats(e.target.value)} placeholder="Amsterdam"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Straatnaam</label>
            <input value={straatnaam} onChange={e => setStraatnaam(e.target.value)} placeholder="Kerkstraat"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Huisnummer</label>
            <input value={huisnummer} onChange={e => setHuisnummer(e.target.value)} placeholder="12A"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Electrode type + drijfmethode */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">Elektrode type</p>
        <div className="grid grid-cols-2 gap-2">
          {(['pen', 'lint'] as const).map(t => (
            <button key={t} type="button" onClick={() => setElectrodeType(t)}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                electrodeType === t
                  ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                  : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
              }`}>
              {t === 'pen' ? 'Verticale pen / staaf' : 'Horizontaal lint'}
            </button>
          ))}
        </div>

        {electrodeType === 'pen' && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-white/70">
              Gebruikte drijfmethode
              {recommendedDrijfmethode && (
                <span className="ml-2 text-white/40">
                  (aanbevolen: {DRIVE_METHOD_LABELS[recommendedDrijfmethode as DriveMethod] ?? recommendedDrijfmethode})
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {DRIVE_METHODS.map(m => (
                <button
                  key={m} type="button" onClick={() => setDrijfmethode(m)}
                  className={`rounded-lg border px-2 py-2 text-left text-xs transition-all ${
                    drijfmethode === m
                      ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                      : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
                  }`}
                >
                  {DRIVE_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Measurements — multi-rod */}
      {isMultiRod && electrodeType === 'pen' ? (
        <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                Pennen — eindmeting per pen <span className="text-red-400">*</span>
              </p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Berekening adviseerde {aantalPennen} pennen. Pas aan aan werkelijk geplaatste situatie.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {rods.map((rod, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-white/70">Pen {rod.rod_number}</p>
                  {rods.length > 1 && (
                    <button type="button" onClick={() => removeRod(i)}
                      className="text-[10px] text-white/30 hover:text-red-400 transition-colors">
                      Verwijder
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] text-white/50">Geïnstalleerde diepte (m)</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min="0.5" step="0.1"
                        value={rod.installed_depth}
                        onChange={e => updateRod(i, 'installed_depth', e.target.value)}
                        placeholder="bijv. 7.0"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                      />
                      <span className="text-xs text-white/40">m</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-white/50">Gemeten Ra — alleen deze pen (Ω)</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min="0" step="0.01"
                        value={rod.achieved_ra}
                        onChange={e => updateRod(i, 'achieved_ra', e.target.value)}
                        placeholder="bijv. 17.5"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                      />
                      <span className="text-xs text-white/40">Ω</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addRod}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#E8761A] hover:text-[#d06510] transition-colors">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            Pen toevoegen
          </button>

          {/* Combined Ra */}
          <div className="mt-5 rounded-xl border border-[#E8761A]/20 bg-[#E8761A]/5 p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
              Gecombineerde Ra <span className="text-red-400">*</span>
            </p>
            <p className="mb-3 text-[10px] text-white/50">
              Meet Ra nadat alle {rods.length} pennen parallel zijn aangesloten.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="0.01"
                value={combinedRa}
                onChange={e => setCombinedRa(e.target.value)}
                placeholder="bijv. 9.2"
                className="w-32 rounded-lg border border-[#E8761A]/30 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
              />
              <span className="text-sm text-white/60">Ω</span>
            </div>
          </div>
        </div>
      ) : (
        /* Single rod — depth curve + final measurement */
        <>
          <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
              Dieptecurve — meting per 3 m
            </p>
            <p className="mb-4 text-[10px] text-white/40">Voer Ra (Ω) in per diepte stap</p>
            <div className="flex flex-col gap-2">
              {depthCurve.map((row, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0.5" step="0.5" value={row.depth}
                      onChange={e => updateRow(i, 'depth', Number(e.target.value))}
                      className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
                    <span className="text-xs text-white/50">m</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" step="0.1" value={row.ra || ''}
                      onChange={e => updateRow(i, 'ra', Number(e.target.value))}
                      placeholder="Ra (Ω)"
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
                    <span className="text-xs text-white/50">Ω</span>
                  </div>
                  {depthCurve.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)}
                      className="text-white/30 hover:text-red-400 transition-colors" aria-label="Verwijder rij">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow}
              className="mt-3 flex items-center gap-1.5 text-xs text-[#E8761A] hover:text-[#d06510] transition-colors">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Meetpunt toevoegen
            </button>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
              Eindmeting <span className="text-red-400">*</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-white/70">Gemeten Ra (Ω)</label>
                <input type="number" min="0" step="0.01" value={achievedRa}
                  onChange={e => setAchievedRa(e.target.value)} placeholder="bijv. 8.5"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/70">Geïnstalleerde diepte (m)</label>
                <input type="number" min="0.5" step="0.1" value={installedDepth}
                  onChange={e => setInstalledDepth(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Notes */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/60">Opmerkingen</p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Bijzonderheden, afwijkingen, bodemcondities ter plaatse…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none resize-none" />
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <button type="submit" disabled={submitting || saving}
        className="rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white transition-opacity hover:bg-[#d06510] disabled:opacity-50">
        {submitting ? 'Indienen…' : 'Meting bevestigen & indienen'}
      </button>

      <button type="button" onClick={handleSaveAndClose} disabled={saving || submitting}
        className="rounded-2xl border border-white/10 bg-white/4 py-3.5 text-sm font-semibold text-white/60 hover:bg-white/8 hover:text-white disabled:opacity-40 transition-colors">
        {saving ? 'Opslaan…' : '↗ Tijdelijk opslaan & sluiten'}
      </button>

      <p className="text-center text-[10px] text-white/40">
        Na indienen zijn de meetwaarden vergrendeld. De opdrachtgever ontvangt automatisch een bericht.
      </p>
    </form>
  );
}
