'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { reverseGeocode, forwardGeocode } from '@/lib/geocoding';

interface DepthPoint { depth: number; ra: number }

interface Props {
  uuid:                 string;
  initialPostcode?:     string;
  initialElectrodeType: 'pen' | 'lint';
  expectedDepth?:       number;
}

export function MonteurForm({ uuid, initialPostcode, initialElectrodeType, expectedDepth }: Props) {
  const router = useRouter();

  // Location state
  const [lat, setLat]         = useState<number | null>(null);
  const [lon, setLon]         = useState<number | null>(null);
  const [gpsAccuracy, setAcc] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading]   = useState(false);
  const [gpsError, setGpsError]       = useState('');
  const [coordsSource, setCoordsSource] = useState<'gps' | 'address' | null>(null);
  const [geoFilling, setGeoFilling]   = useState(false);

  // Address
  const [postcode,   setPostcode]   = useState(initialPostcode ?? '');
  const [straatnaam, setStraatnaam] = useState('');
  const [huisnummer, setHuisnummer] = useState('');
  const [woonplaats, setWoonplaats] = useState('');

  // Measurements
  const [electrodeType, setElectrodeType] = useState(initialElectrodeType);
  const [depthCurve, setDepthCurve] = useState<DepthPoint[]>(
    expectedDepth
      ? buildInitialCurve(expectedDepth)
      : [{ depth: 3, ra: 0 }],
  );
  const [achievedRa,     setAchievedRa]     = useState('');
  const [installedDepth, setInstalledDepth] = useState(expectedDepth?.toFixed(2) ?? '');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fwdTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const straatnaamRef = useRef(straatnaam);
  const woonplaatsRef = useRef(woonplaats);
  useEffect(() => { straatnaamRef.current = straatnaam; }, [straatnaam]);
  useEffect(() => { woonplaatsRef.current = woonplaats; }, [woonplaats]);

  // Forward geocode: postcode + huisnummer → lat/lon (only when GPS hasn't been used yet)
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
      // Use refs to get current values — avoids stale closure overwriting user input
      if (!straatnaamRef.current && result.straatnaam) setStraatnaam(result.straatnaam);
      if (!woonplaatsRef.current && result.woonplaats) setWoonplaats(result.woonplaats);
    }, 600);

    return () => clearTimeout(fwdTimerRef.current);
  }, [postcode, huisnummer, coordsSource]);

  function buildInitialCurve(maxDepth: number): DepthPoint[] {
    const rows: DepthPoint[] = [];
    for (let d = 3; d <= Math.ceil(maxDepth) + 3; d += 3) {
      rows.push({ depth: d, ra: 0 });
    }
    return rows;
  }

  function requestGPS() {
    if (!navigator.geolocation) { setGpsError('Geolocatie niet beschikbaar op dit apparaat.'); return; }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude;
        const newLon = pos.coords.longitude;
        setLat(newLat);
        setLon(newLon);
        setAcc(pos.coords.accuracy);
        setCoordsSource('gps');
        setGpsLoading(false);

        // Reverse geocode → fill address fields (non-blocking, only fills empty fields)
        setGeoFilling(true);
        reverseGeocode(newLat, newLon)
          .then(addr => {
            if (!addr) return;
            if (!postcode)   setPostcode(addr.postcode);
            if (!straatnaam) setStraatnaam(addr.straatnaam);
            if (!huisnummer) setHuisnummer(addr.huisnummer);
            if (!woonplaats) setWoonplaats(addr.woonplaats);
          })
          .finally(() => setGeoFilling(false));
      },
      (err) => {
        setGpsError('Locatie ophalen mislukt: ' + err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lat || !lon) { setError('Locatie is verplicht — gebruik GPS of vul postcode + huisnummer in.'); return; }
    if (!achievedRa || !installedDepth) { setError('Eindmeting (Ra en diepte) zijn verplicht.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/meting/${uuid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lon,
          gps_accuracy_m:  coordsSource === 'gps' ? gpsAccuracy : null,
          postcode, straatnaam, huisnummer, woonplaats,
          depth_curve:     depthCurve,
          achieved_ra:     Number(achievedRa),
          installed_depth: Number(installedDepth),
          electrode_type:  electrodeType,
          notes,
        }),
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {/* Location */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          Locatie <span className="text-red-400">*</span>
        </p>

        {lat && lon ? (
          <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-green-400">
                {coordsSource === 'gps' ? 'GPS-locatie bepaald' : 'Locatie op basis van adres'}
              </p>
              {coordsSource === 'address' && (
                <span className="text-[10px] border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full">
                  Adresschatting — GPS geeft hogere precisie
                </span>
              )}
            </div>
            <p className="text-xs text-white/60 mt-0.5">
              {lat.toFixed(6)}, {lon.toFixed(6)}
              {gpsAccuracy && coordsSource === 'gps' && (
                <span className="ml-2 text-white/40">± {gpsAccuracy.toFixed(0)} m</span>
              )}
            </p>
          </div>
        ) : null}

        {gpsError && <p className="mb-2 text-xs text-red-400">{gpsError}</p>}
        <button
          type="button"
          onClick={requestGPS}
          disabled={gpsLoading}
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
          GPS geeft de nauwkeurigste locatie. U kunt ook alleen het adres invullen — de coördinaten worden dan automatisch bepaald.
        </p>
      </div>

      {/* Address */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Adres locatie</p>
          {geoFilling && (
            <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-white/60" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-white/70">Postcode</label>
            <input
              value={postcode} onChange={e => setPostcode(e.target.value)}
              placeholder="1234 AB"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-white/70">Woonplaats</label>
            <input
              value={woonplaats} onChange={e => setWoonplaats(e.target.value)}
              placeholder="Amsterdam"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Straatnaam</label>
            <input
              value={straatnaam} onChange={e => setStraatnaam(e.target.value)}
              placeholder="Kerkstraat"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Huisnummer</label>
            <input
              value={huisnummer} onChange={e => setHuisnummer(e.target.value)}
              placeholder="12A"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Electrode type */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">Elektrode type</p>
        <div className="grid grid-cols-2 gap-2">
          {(['pen', 'lint'] as const).map(t => (
            <button
              key={t} type="button"
              onClick={() => setElectrodeType(t)}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                electrodeType === t
                  ? 'border-[#E8761A] bg-[#E8761A]/10 text-[#E8761A]'
                  : 'border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:text-white'
              }`}
            >
              {t === 'pen' ? 'Verticale pen / staaf' : 'Horizontaal lint'}
            </button>
          ))}
        </div>
      </div>

      {/* Depth curve */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          Dieptecurve — meting per 3 m
        </p>
        <p className="mb-4 text-[10px] text-white/40">Voer Ra (Ω) in per diepte stap</p>

        <div className="flex flex-col gap-2">
          {depthCurve.map((row, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min="0.5" step="0.5"
                  value={row.depth}
                  onChange={e => updateRow(i, 'depth', Number(e.target.value))}
                  className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                />
                <span className="text-xs text-white/50">m</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min="0" step="0.1"
                  value={row.ra || ''}
                  onChange={e => updateRow(i, 'ra', Number(e.target.value))}
                  placeholder="Ra (Ω)"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                />
                <span className="text-xs text-white/50">Ω</span>
              </div>
              {depthCurve.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-white/30 hover:text-red-400 transition-colors"
                  aria-label="Verwijder rij"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-3 flex items-center gap-1.5 text-xs text-[#E8761A] hover:text-[#d06510] transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          Meetpunt toevoegen
        </button>
      </div>

      {/* Final measurement */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          Eindmeting <span className="text-red-400">*</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-white/70">Gemeten Ra (Ω)</label>
            <input
              type="number" min="0" step="0.01"
              value={achievedRa}
              onChange={e => setAchievedRa(e.target.value)}
              placeholder="bijv. 8.5"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Geïnstalleerde diepte (m)</label>
            <input
              type="number" min="0.5" step="0.1"
              value={installedDepth}
              onChange={e => setInstalledDepth(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/60">Opmerkingen</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Bijzonderheden, afwijkingen, bodemcondities ter plaatse…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none resize-none"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white transition-opacity hover:bg-[#d06510] disabled:opacity-50"
      >
        {submitting ? 'Indienen…' : 'Meting bevestigen & indienen'}
      </button>

      <p className="text-center text-[10px] text-white/40">
        Na indienen zijn de meetwaarden vergrendeld. De opdrachtgever ontvangt automatisch een bericht.
      </p>
    </form>
  );
}
