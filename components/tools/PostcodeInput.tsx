'use client';

import { useState } from 'react';
import { useCalculator } from '@/lib/context/CalculatorContext';
import { calcRiskClass } from '@/lib/calculations';

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
  const { postcode, huisnummer, soilData, soilLoading, soilError, setPostcode, setHuisnummer, fetchSoilData } =
    useCalculator();

  const [manualRho, setManualRho] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

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
              <label className="text-xs font-medium text-zinc-500">Postcode</label>
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
              <label className="text-xs font-medium text-zinc-500">Huisnr.</label>
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
                <p className="mb-2 text-[11px] text-zinc-500 tracking-wide">
                  {soilData.straatnaam
                    ? [soilData.straatnaam, soilData.huisnummer].filter(Boolean).join(' ') +
                      (soilData.woonplaats ? `, ${soilData.woonplaats}` : '')
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
                      Regionale schatting (gratis)
                    </span>
                    <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                      {soilData.dataSource === 'cpt' ? 'CPT sondering' :
                       soilData.dataSource === 'bhrgt' ? 'BRO boring' :
                       soilData.dataSource === 'geotop' ? 'GeoTOP model' :
                       'Bodemkaart'}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-zinc-400">
                    {soilData.dataSource === 'cpt'
                      ? 'Grondsoort op basis van een nabijgelegen conuspenetratietest.'
                      : soilData.dataSource === 'bhrgt'
                      ? 'Grondsoort op basis van een nabijgelegen geotechnische boring.'
                      : soilData.dataSource === 'geotop'
                      ? 'Grondsoort uit het nationaal GeoTOP voxelmodel (TNO/BRO).'
                      : 'Grondsoort uit de Bodemkaart 1:50.000 (oppervlaktelaag).'}
                    {' '}Exacte per-adres meting beschikbaar met Pro.
                  </p>
                  <SoilTable samples={soilData.samples} />
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleSoilDataApply}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-400"
                    >
                      Toepassen (ρ = {soilData.dominantRho} Ω·m)
                    </button>
                    <a href="/pricing" className="text-xs text-zinc-500 underline hover:text-orange-400">
                      Upgrade voor exacte meting →
                    </a>
                  </div>
                </div>
              )}

              {/* BRO result — pro tier */}
              {soilData && isPro && (
                <div className="mb-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-green-400">
                      {soilData.dataSource === 'cpt' ? 'CPT sondering — Pro' :
                       soilData.dataSource === 'bhrgt' ? 'BRO boring — Pro' :
                       soilData.dataSource === 'geotop' ? 'GeoTOP model — Pro' :
                       'Bodemkaart — Pro'}
                    </span>
                    {soilData.groundwaterDepth != null && (
                      <span className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        GW: {soilData.groundwaterDepth.toFixed(1)} m
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
                    <p className="mb-2 text-xs text-zinc-500">
                      Geen BRO-data beschikbaar voor dit adres. Kies grondsoort handmatig:
                    </p>
                  )}
                  {!soilData && !soilError && (
                    <p className="mb-2 text-xs text-zinc-500">Of kies grondsoort handmatig:</p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                    {MANUAL_RHO_OPTIONS.map((opt) => (
                      <button
                        key={opt.rho}
                        onClick={() => handleManualSelect(opt.rho)}
                        className={`rounded-lg border px-2.5 py-2 text-center text-xs font-medium transition-all ${
                          effectiveManualRho === opt.rho
                            ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                            : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500'
                        }`}
                      >
                        <span className="block font-semibold">{opt.label}</span>
                        <span className="block text-zinc-500 mt-0.5">{opt.rho} Ω·m</span>
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
          <tr className="text-zinc-500">
            <th className="pb-1 text-left font-medium">Diepte</th>
            <th className="pb-1 text-left font-medium">Klasse</th>
            <th className="pb-1 text-left font-medium">ρ (Ω·m)</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <tr key={s.depth} className="border-t border-white/5">
              <td className="py-1 text-zinc-400">{s.depth} m</td>
              <td className="py-1 text-zinc-400">{s.lithoClass}</td>
              <td className="py-1 font-mono font-semibold text-orange-400">{s.rho}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
