'use client';

import { useState } from 'react';
import { useCalculator } from '@/lib/context/CalculatorContext';
import { calcRiskClass } from '@/lib/calculations';
import { wgs84ToRd } from '@/lib/rd';

const MANUAL_RHO_OPTIONS = [
  { label: 'Klei / nat', rho: 30 },
  { label: 'Leem / vochtig', rho: 60 },
  { label: 'Zand (gemiddeld)', rho: 125 },
  { label: 'Droog zand', rho: 300 },
  { label: 'Veen', rho: 2000 },
  { label: 'Rots', rho: 4000 },
];

interface PostcodeInputProps {
  onRhoChange?: (rho: number) => void;
  onGroundwaterChange?: (depth: number | null) => void;
  isPro?: boolean;
}

export function PostcodeInput({ onRhoChange, onGroundwaterChange, isPro = false }: PostcodeInputProps) {
  const {
    postcode, huisnummer, soilData, soilLoading, soilError,
    setPostcode, setHuisnummer, fetchSoilData,
    setSoilData, setSoilLoading, setSoilError,
  } = useCalculator();

  const [manualRho, setManualRho] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'denied' | 'error'>('idle');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);

  // When BRO returns a fallback, auto-highlight the matching manual button
  // so there's never a "badge shown but nothing selected" state.
  const effectiveManualRho = manualRho ?? (soilData?.source === 'fallback' ? soilData.dominantRho : null);

  const activeRho = soilData ? soilData.dominantRho : effectiveManualRho;
  const riskClass = activeRho != null ? calcRiskClass(activeRho) : null;

  function handleFetch() {
    if (!postcode.trim()) return;
    setManualRho(null); // reset manual pick on new lookup
    fetchSoilData(postcode.trim(), huisnummer.trim() || undefined);
  }

  function handleManualSelect(rho: number) {
    setManualRho(rho);
    onRhoChange?.(rho);
    onGroundwaterChange?.(null);
  }

  function handleSoilDataApply() {
    if (!soilData) return;
    onRhoChange?.(soilData.dominantRho);
    onGroundwaterChange?.(soilData.groundwaterDepth);
  }

  function handleGps() {
    if (!navigator.geolocation) {
      setSoilError('GPS niet beschikbaar in uw browser.');
      return;
    }
    setGpsStatus('loading');
    setSoilLoading(true);
    setSoilError('');
    setSoilData(null);
    setManualRho(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setGpsCoords({ lat, lon });
        const { rdX, rdY } = wgs84ToRd(lat, lon);
        try {
          const params = new URLSearchParams({
            rdX: Math.round(rdX).toString(),
            rdY: Math.round(rdY).toString(),
            lat: lat.toFixed(6),
            lon: lon.toFixed(6),
          });
          const res = await fetch(`/api/bro?${params}`);
          const data = await res.json();
          if (!res.ok || data.error) {
            setSoilError(data.error ?? 'BRO ophalen mislukt');
            setGpsStatus('error');
          } else {
            setSoilData(data);
            setGpsStatus('idle');
          }
        } catch {
          setSoilError('BRO ophalen mislukt');
          setGpsStatus('error');
        } finally {
          setSoilLoading(false);
        }
      },
      (err) => {
        setSoilLoading(false);
        if (err.code === 1) {
          setGpsStatus('denied');
          setSoilError('Locatietoegang geweigerd — sta locatie toe in uw browserinstellingen.');
        } else {
          setGpsStatus('error');
          setSoilError('Locatie kon niet worden bepaald. Probeer het opnieuw.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const riskColorMap: Record<string, string> = {
    green: 'border-green-500/40 bg-green-500/10 text-green-400',
    yellow: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
    orange: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
    red: 'border-red-500/40 bg-red-500/10 text-red-400',
  };

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-base">📍</span>
        <span className="text-sm font-semibold text-zinc-200">Locatie & grondgegevens</span>
        {soilLoading && (
          <span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" />
        )}
        {soilData && !soilLoading && (
          <span className="ml-2 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
            BRO ✓
          </span>
        )}
        <span className="ml-auto text-zinc-600">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 pb-5 pt-4">
          {/* Postcode row */}
          <div className="mb-3 flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-zinc-300">Postcode</label>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                placeholder="1234 AB"
                maxLength={7}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1 w-24">
              <label className="text-xs font-medium text-zinc-300">Huisnr.</label>
              <input
                type="text"
                value={huisnummer}
                onChange={(e) => setHuisnummer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                placeholder="10"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={handleFetch}
                disabled={soilLoading || !postcode.trim()}
                className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:bg-orange-400 disabled:opacity-40"
              >
                {soilLoading ? '...' : 'Ophalen'}
              </button>
            </div>
          </div>

          {/* GPS button */}
          <button
            onClick={handleGps}
            disabled={soilLoading || gpsStatus === 'loading'}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-40"
          >
            {gpsStatus === 'loading' ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                Locatie bepalen…
              </>
            ) : (
              <>📍 Gebruik mijn locatie</>
            )}
          </button>

          {/* Loading skeleton — replaces old data while new fetch is in progress */}
          {soilLoading && (
            <div className="mb-3 space-y-2 animate-pulse">
              <div className="h-3 w-40 rounded bg-zinc-800" />
              <div className="h-20 rounded-xl bg-zinc-800/70" />
            </div>
          )}

          {!soilLoading && (
            <>
              {/* Address confirmation */}
              {soilData && (
                <p className="mb-2 text-[11px] text-zinc-300 tracking-wide">
                  {soilData.straatnaam
                    ? [soilData.straatnaam, soilData.huisnummer].filter(Boolean).join(' ') +
                      (soilData.woonplaats ? `, ${soilData.woonplaats}` : '')
                    : gpsCoords
                    ? `📍 ${gpsCoords.lat.toFixed(5)}°N, ${gpsCoords.lon.toFixed(5)}°E`
                    : [postcode.toUpperCase(), huisnummer].filter(Boolean).join(' ')}
                </p>
              )}

              {soilError && (
                <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {soilError}
                </p>
              )}

              {/* BRO result — free tier */}
              {soilData && !isPro && soilData.source === 'bro' && (
                <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                      BRO gronddata
                    </span>
                    <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                      {soilData.dataSource === 'cpt' ? 'CPT sondering' :
                       soilData.dataSource === 'bhrgt' ? 'BRO boring' :
                       soilData.dataSource === 'geotop' ? 'GeoTOP model' :
                       soilData.dataSource === 'bodemkaart' ? 'Bodemkaart' :
                       'Regionaal'}
                    </span>
                    {soilData.boringAfstand != null && (
                      <span className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        {soilData.boringAfstand < 1
                          ? `${Math.round(soilData.boringAfstand * 1000)} m`
                          : `${soilData.boringAfstand.toFixed(1)} km`}
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-xs text-zinc-300">
                    {soilData.dataSource === 'cpt'
                      ? 'Grondsoort op basis van een nabijgelegen conuspenetratietest (BRO).'
                      : soilData.dataSource === 'bhrgt'
                      ? `Grondsoort op basis van een geotechnische boring (BRO)${soilData.boringAfstand != null ? ` op ${soilData.boringAfstand < 1 ? Math.round(soilData.boringAfstand * 1000) + ' m' : soilData.boringAfstand.toFixed(1) + ' km'} afstand` : ''}.`
                      : soilData.dataSource === 'geotop'
                      ? 'Grondsoort uit het nationaal GeoTOP voxelmodel (TNO/BRO).'
                      : 'Grondsoort uit de Bodemkaart 1:50.000 (oppervlaktelaag).'}
                  </p>
                  <SoilTable samples={soilData.samples} />
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleSoilDataApply}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-400"
                    >
                      Toepassen (ρ = {soilData.dominantRho} Ω·m)
                    </button>
                    <a href="/pricing" className="text-xs text-zinc-300 underline hover:text-orange-400">
                      Pendiepteberekening → Pro
                    </a>
                  </div>
                </div>
              )}

              {/* BRO result — pro tier */}
              {soilData && isPro && soilData.source === 'bro' && (
                <div className="mb-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-green-400">
                      {soilData.dataSource === 'cpt' ? 'CPT sondering' :
                       soilData.dataSource === 'bhrgt' ? 'BRO boring' :
                       soilData.dataSource === 'geotop' ? 'GeoTOP model' :
                       soilData.dataSource === 'bodemkaart' ? 'Bodemkaart' :
                       'BRO gronddata'}
                    </span>
                    {soilData.boringAfstand != null && (
                      <span
                        className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                        title="Afstand van het adres tot de gebruikte boring"
                      >
                        {soilData.boringAfstand < 1
                          ? `${Math.round(soilData.boringAfstand * 1000)} m`
                          : `${soilData.boringAfstand.toFixed(1)} km`}
                      </span>
                    )}
                    {soilData.groundwaterDepth != null && (
                      <span
                        className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                        title={soilData.gwSource === 'peilbuis' ? 'GHG afgeleid uit BRO-peilbuizen via NAP-correctie' : 'Grondwaterstand — verifieer lokaal'}
                      >
                        GW: {soilData.groundwaterDepth.toFixed(1)} m
                        {soilData.gwSource === 'peilbuis' ? ' ✓' : ' ⚠'}
                      </span>
                    )}
                  </div>
                  <SoilTable samples={soilData.samples} />
                  <button
                    onClick={handleSoilDataApply}
                    className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-500"
                  >
                    Toepassen (ρ = {soilData.dominantRho} Ω·m)
                  </button>
                </div>
              )}

              {/* Handmatige keuze: geen BRO-data, of fallback */}
              {(!soilData || soilData.source === 'fallback') && (
                <div>
                  {soilData?.source === 'fallback' && (
                    <p className="mb-2 text-xs text-zinc-300">
                      Geen BRO-data beschikbaar voor dit adres. Kies grondsoort handmatig:
                    </p>
                  )}
                  {!soilData && !soilError && (
                    <p className="mb-2 text-xs text-zinc-300">Of kies grondsoort handmatig:</p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                    {MANUAL_RHO_OPTIONS.map((opt) => (
                      <button
                        key={opt.rho}
                        onClick={() => handleManualSelect(opt.rho)}
                        className={`rounded-lg border px-2.5 py-2 text-center text-xs font-medium transition-all ${
                          effectiveManualRho === opt.rho
                            ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                            : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        <span className="block font-semibold">{opt.label}</span>
                        <span className="block text-zinc-300 mt-0.5">{opt.rho} Ω·m</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk class badge */}
              {riskClass && (
                <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${riskColorMap[riskClass.color]}`}>
                  <span className="shrink-0 font-black text-lg">{riskClass.riskClass}</span>
                  <div>
                    <p className="text-xs font-semibold">{riskClass.label}</p>
                    <p className="mt-0.5 text-xs opacity-80">{riskClass.description}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SoilTable({ samples }: { samples: { depth: number; lithoClass: number; rho: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-300">
            <th className="pb-1 text-left font-medium">Diepte</th>
            <th className="pb-1 text-left font-medium">Klasse</th>
            <th className="pb-1 text-left font-medium">ρ (Ω·m)</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <tr key={s.depth} className="border-t border-white/5">
              <td className="py-1 text-zinc-300">{s.depth} m</td>
              <td className="py-1 text-zinc-300">{s.lithoClass}</td>
              <td className="py-1 font-mono font-semibold text-orange-400">{s.rho}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
