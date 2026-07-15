'use client';

import { useMemo, useState } from 'react';
import { useCalculator } from '@/lib/context/CalculatorContext';
import { calcRiskClass } from '@/lib/calculations';
import { wgs84ToRd } from '@/lib/rd';
import { reverseGeocode } from '@/lib/geocoding';
import { buildSoilRhoPreview } from '@/lib/pipeline/effective-rho';
import { StatusChip } from '@/components/ui/StatusChip';
import { IconAlert, IconChevronDown, IconMapPin } from '@/components/ui/icons';

const MANUAL_RHO_OPTIONS = [
  { label: 'Klei / nat', rho: 30, lithoClass: 1 },
  { label: 'Leem / vochtig', rho: 60, lithoClass: 2 },
  { label: 'Zand (gemiddeld)', rho: 125, lithoClass: 3 },
  { label: 'Droog zand', rho: 300, lithoClass: 3 },
  { label: 'Veen', rho: 2000, lithoClass: 5 },
  { label: 'Rots', rho: 4000, lithoClass: 6 },
] as const;

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

  const soilPreview = useMemo(() => {
    if (!soilData || soilData.source === 'fallback') return null;
    return buildSoilRhoPreview({
      samples: soilData.samples?.map((s) => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass })),
      gwDepth: soilData.groundwaterDepth,
      dominantLithoClass: soilData.dominantLithoClass,
      dominantRho: soilData.dominantRho,
      dataSource: soilData.dataSource,
    });
  }, [soilData]);

  const manualPreview = useMemo(() => {
    if (effectiveManualRho == null || soilData) return null;
    const opt = MANUAL_RHO_OPTIONS.find((o) => o.rho === effectiveManualRho);
    return buildSoilRhoPreview({
      gwDepth: null,
      dominantLithoClass: opt?.lithoClass ?? null,
      dominantRho: effectiveManualRho,
    });
  }, [effectiveManualRho, soilData]);

  const activeRho = soilPreview?.pipelineRho ?? manualPreview?.pipelineRho ?? effectiveManualRho;
  const riskClass = activeRho != null ? calcRiskClass(activeRho) : null;

  function applySoilPreview() {
    if (!soilData) return;
    const preview = buildSoilRhoPreview({
      samples: soilData.samples?.map((s) => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass })),
      gwDepth: soilData.groundwaterDepth,
      dominantLithoClass: soilData.dominantLithoClass,
      dominantRho: soilData.dominantRho,
      dataSource: soilData.dataSource,
    });
    onRhoChange?.(preview.pipelineRho);
    onGroundwaterChange?.(soilData.groundwaterDepth);
  }

  function handleFetch() {
    if (!postcode.trim()) return;
    setManualRho(null); // reset manual pick on new lookup
    fetchSoilData(postcode.trim(), huisnummer.trim() || undefined);
  }

  function handleManualSelect(rho: number) {
    setManualRho(rho);
    const opt = MANUAL_RHO_OPTIONS.find((o) => o.rho === rho);
    const preview = buildSoilRhoPreview({
      gwDepth: null,
      dominantLithoClass: opt?.lithoClass ?? null,
      dominantRho: rho,
    });
    onRhoChange?.(preview.pipelineRho);
    onGroundwaterChange?.(null);
  }

  function handleSoilDataApply() {
    applySoilPreview();
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

        // Reverse geocode in parallel with BRO — GPS-klik is authoritative, altijd overschrijven
        reverseGeocode(lat, lon).then(addr => {
          if (!addr) return;
          setPostcode(addr.postcode ?? '');
          setHuisnummer(addr.huisnummer ?? '');
        }).catch(() => {/* non-blocking */});

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
            const preview = buildSoilRhoPreview({
              samples: data.samples?.map((s: { depth: number; lithoClass: number }) => ({
                depth: Math.abs(s.depth),
                lithoClass: s.lithoClass,
              })),
              gwDepth: data.groundwaterDepth,
              dominantLithoClass: data.dominantLithoClass,
              dominantRho: data.dominantRho,
              dataSource: data.dataSource,
            });
            onRhoChange?.(preview.pipelineRho);
            if (data.groundwaterDepth != null) onGroundwaterChange?.(data.groundwaterDepth);
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
    <div className="panel overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <IconMapPin className="h-4 w-4 shrink-0 text-brand/80" />
        <span className="text-sm font-semibold text-white/90">Locatie & grondgegevens</span>
        {soilLoading && (
          <span className="ml-1 h-4 w-4 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
        )}
        {soilData && !soilLoading && (
          <StatusChip label="BRO geladen" tone="success" />
        )}
        <IconChevronDown
          className={`ml-auto h-4 w-4 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3">
          {/* Postcode row */}
          <div className="mb-3 flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-white/55">Postcode</label>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                placeholder="1234 AB"
                maxLength={7}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1 w-24">
              <label className="text-xs font-medium text-white/55">Huisnr.</label>
              <input
                type="text"
                value={huisnummer}
                onChange={(e) => setHuisnummer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                placeholder="10"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={handleFetch}
                disabled={soilLoading || !postcode.trim()}
                className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
              >
                {soilLoading ? '...' : 'Ophalen'}
              </button>
            </div>
          </div>

          {/* GPS button */}
          <button
            onClick={handleGps}
            disabled={soilLoading || gpsStatus === 'loading'}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/3 px-3 py-2 text-xs text-white/55 transition-colors hover:border-white/15 hover:text-white/75 disabled:opacity-40"
          >
            {gpsStatus === 'loading' ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
                Locatie bepalen…
              </>
            ) : (
              <>
                <IconMapPin className="h-3.5 w-3.5" />
                Gebruik mijn locatie
              </>
            )}
          </button>

          {/* Loading skeleton — replaces old data while new fetch is in progress */}
          {soilLoading && (
            <div className="mb-3 space-y-2">
              <div className="shimmer h-3 w-40" />
              <div className="shimmer h-20" />
            </div>
          )}

          {!soilLoading && (
            <>
              {/* Address confirmation */}
              {soilData && (
                <p className="mb-2 text-xs text-white/55">
                  {soilData.straatnaam
                    ? [soilData.straatnaam, soilData.huisnummer].filter(Boolean).join(' ') +
                      (soilData.woonplaats ? `, ${soilData.woonplaats}` : '')
                    : gpsCoords
                    ? `${gpsCoords.lat.toFixed(5)}°N, ${gpsCoords.lon.toFixed(5)}°E`
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
                <div className="mb-3 rounded-lg border border-brand/25 bg-brand-muted p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-brand">BRO gronddata</span>
                    <StatusChip
                      label={
                        soilData.dataSource === 'cpt' ? 'CPT sondering' :
                        soilData.dataSource === 'bhrgt' ? 'BRO boring' :
                        soilData.dataSource === 'geotop' ? 'GeoTOP model' :
                        soilData.dataSource === 'bodemkaart' ? 'Bodemkaart' :
                        'Regionaal'
                      }
                      tone="brand"
                    />
                    {soilData.boringAfstand != null && (
                      <StatusChip
                        label={
                          soilData.boringAfstand < 1
                            ? `${Math.round(soilData.boringAfstand * 1000)} m`
                            : `${soilData.boringAfstand.toFixed(1)} km`
                        }
                      />
                    )}
                  </div>
                  <p className="mb-3 text-xs text-white/60 leading-relaxed">
                    {soilData.dataSource === 'cpt'
                      ? 'Grondsoort op basis van een nabijgelegen conuspenetratietest (BRO).'
                      : soilData.dataSource === 'bhrgt'
                      ? `Grondsoort op basis van een geotechnische boring (BRO)${soilData.boringAfstand != null ? ` op ${soilData.boringAfstand < 1 ? Math.round(soilData.boringAfstand * 1000) + ' m' : soilData.boringAfstand.toFixed(1) + ' km'} afstand` : ''}.`
                      : soilData.dataSource === 'geotop'
                      ? 'Grondsoort uit het nationaal GeoTOP voxelmodel (TNO/BRO).'
                      : 'Grondsoort uit de Bodemkaart 1:50.000 (oppervlaktelaag).'}
                  </p>
                  <SoilTable samples={soilData.samples} />
                  <ProfileAnomalyBanner samples={soilData.samples} boringAfstand={soilData.boringAfstand} />
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleSoilDataApply}
                      className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover"
                    >
                      {new Set(soilData.samples.map(s => s.lithoClass)).size > 1
                        ? `Gebruik gelaagd profiel (effectief ${soilPreview?.effectiveRho ?? soilData.dominantRho} Ω·m)`
                        : `Toepassen (effectief ${soilPreview?.effectiveRho ?? soilData.dominantRho} Ω·m)`}
                    </button>
                    <a href="/pricing" className="text-xs text-white/50 underline hover:text-brand">
                      Pendiepteberekening — Pro
                    </a>
                  </div>
                </div>
              )}

              {/* BRO result — pro tier */}
              {soilData && isPro && soilData.source === 'bro' && (
                <div className="mb-3 rounded-lg border border-white/10 bg-white/3 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-white/80">
                      {soilData.dataSource === 'cpt' ? 'CPT sondering' :
                       soilData.dataSource === 'bhrgt' ? 'BRO boring' :
                       soilData.dataSource === 'geotop' ? 'GeoTOP model' :
                       soilData.dataSource === 'bodemkaart' ? 'Bodemkaart' :
                       'BRO gronddata'}
                    </span>
                    {soilData.boringAfstand != null && (
                      <StatusChip
                        label={
                          soilData.boringAfstand < 1
                            ? `${Math.round(soilData.boringAfstand * 1000)} m`
                            : `${soilData.boringAfstand.toFixed(1)} km`
                        }
                      />
                    )}
                    {soilData.groundwaterDepth != null && (
                      <StatusChip
                        label={`GW ${soilData.groundwaterDepth.toFixed(1)} m${soilData.gwSource === 'peilbuis' ? '' : ' (verifieer)'}`}
                        tone={soilData.gwSource === 'peilbuis' ? 'success' : 'warning'}
                      />
                    )}
                  </div>
                  <SoilTable samples={soilData.samples} />
                  <ProfileAnomalyBanner samples={soilData.samples} boringAfstand={soilData.boringAfstand} />
                  <button
                    onClick={handleSoilDataApply}
                    className="mt-3 rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover"
                  >
                    {new Set(soilData.samples.map(s => s.lithoClass)).size > 1
                      ? `Gebruik gelaagd profiel (effectief ${soilPreview?.effectiveRho ?? soilData.dominantRho} Ω·m)`
                      : `Toepassen (effectief ${soilPreview?.effectiveRho ?? soilData.dominantRho} Ω·m)`}
                  </button>
                </div>
              )}

              {/* Handmatige keuze: geen BRO-data, of fallback */}
              {(!soilData || soilData.source === 'fallback') && (
                <div>
                  {soilData?.source === 'fallback' && (
                    <p className="mb-2 text-xs text-white/55">
                      Geen BRO-data beschikbaar voor dit adres. Kies grondsoort handmatig:
                    </p>
                  )}
                  {!soilData && !soilError && (
                    <p className="mb-2 text-xs text-white/55">Of kies grondsoort handmatig:</p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                    {MANUAL_RHO_OPTIONS.map((opt) => (
                      <button
                        key={opt.rho}
                        onClick={() => handleManualSelect(opt.rho)}
                        className={`rounded-md border px-2.5 py-2 text-center text-xs font-medium transition-colors ${
                          effectiveManualRho === opt.rho
                            ? 'border-brand/50 bg-brand-muted text-brand'
                            : 'border-white/10 bg-white/3 text-white/60 hover:border-white/20 hover:text-white/80'
                        }`}
                      >
                        <span className="block font-semibold">{opt.label}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-white/45">{opt.rho} Ω·m</span>
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

function detectProfileAnomalies(
  samples: { depth: number; lithoClass: number; rho: number }[],
  boringAfstand?: number | null,
): string[] {
  const warnings: string[] = [];

  if (samples.length > 1) {
    const uniqueClasses = new Set(samples.map(s => s.lithoClass));
    if (uniqueClasses.size === 1) {
      warnings.push(
        'Uniform grondprofiel: alle lagen tonen identieke klasse. Waarschijnlijk een model- of interpolatieschatting zonder directe meting — valideer ter plaatse.',
      );
    }
  }

  if (samples.length === 1) {
    warnings.push('Slechts één laag beschikbaar — profiel is te ondiep voor een volledige bodemopbouw.');
  }

  if (boringAfstand != null && boringAfstand > 0.5) {
    warnings.push(
      `Dichtstbijzijnde meting op ${boringAfstand.toFixed(1)} km — bodemopbouw kan lokaal afwijken.`,
    );
  }

  return warnings;
}

function ProfileAnomalyBanner({ samples, boringAfstand }: {
  samples: { depth: number; lithoClass: number; rho: number }[];
  boringAfstand?: number | null;
}) {
  const warnings = detectProfileAnomalies(samples, boringAfstand);
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-2.5">
      {warnings.map((w, i) => (
        <p key={i} className="flex gap-2 text-xs leading-relaxed text-amber-300/90">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{w}</span>
        </p>
      ))}
    </div>
  );
}

function SoilTable({ samples }: { samples: { depth: number; lithoClass: number; rho: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-white/45">
            <th className="pb-1 text-left font-medium">Diepte</th>
            <th className="pb-1 text-left font-medium">Klasse</th>
            <th className="pb-1 text-left font-medium">ρ (Ω·m)</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <tr key={s.depth} className="border-t border-white/6">
              <td className="py-1 text-white/55">{s.depth} m</td>
              <td className="py-1 text-white/55">{s.lithoClass}</td>
              <td className="py-1 font-mono font-semibold text-brand">{s.rho}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
