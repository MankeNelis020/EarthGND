'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  calcDiepte,
  calcOhmWizard,
  lithoClassToRhoDry,
  type BreakerType,
  type GridSystem,
  type InstallationType,
} from '@/lib/calculations';
import { buildSoilRhoPreview, calcDiepteWithNlLayered } from '@/lib/pipeline/effective-rho';
import { resolveRhoWet } from '@/lib/pipeline/rho-priors';

type ToolMode = 'ohm' | 'diepte';
type AccessLevel = 'free' | 'pro';
type RcdType = 'A' | 'B';
type SoilFallback = 'klei' | 'zand' | 'veen' | 'leem';

interface SharedSettings {
  installationType: InstallationType;
  gridSystem: GridSystem;
}

interface SoilState {
  lithoClass: number | null;
  rho: number;
  groundwaterDepth: number;
  ph: number;
  samples?: { depth: number; lithoClass: number }[];
  message?: string;
  fallbackRequired?: boolean;
}

function pipelineRhoFromManual(lithoClass: number, rho: number, gwDepth: number | null): number {
  return buildSoilRhoPreview({
    gwDepth,
    dominantLithoClass: lithoClass,
    dominantRho: rho,
  }).pipelineRho;
}

const STORAGE_KEY = 'earthgnd:tool:shared-v3';
const DEFAULT_SHARED: SharedSettings = {
  installationType: 'woning',
  gridSystem: 'TT',
};

const MANUAL_SOIL_MAP: Record<SoilFallback, { lithoClass: number; rho: number; label: string }> = {
  klei: { lithoClass: 3, rho: 125, label: 'Klei' },
  leem: { lithoClass: 3, rho: 125, label: 'Leem' },
  zand: { lithoClass: 2, rho: 60, label: 'Zand' },
  veen: { lithoClass: 5, rho: 2000, label: 'Veen' },
};

function riskClass(soil: SoilState): 'I' | 'II' | 'III' | 'IV' {
  const scoreRho = soil.rho <= 80 ? 1 : soil.rho <= 180 ? 2 : soil.rho <= 900 ? 3 : 4;
  const scoreGhg = soil.groundwaterDepth <= 1 ? 1 : soil.groundwaterDepth <= 2.5 ? 2 : soil.groundwaterDepth <= 4 ? 3 : 4;
  const scorePh = soil.ph < 5 ? 4 : soil.ph <= 6 ? 3 : soil.ph <= 7.5 ? 2 : 1;
  const avg = (scoreRho + scoreGhg + scorePh) / 3;
  if (avg <= 1.5) return 'I';
  if (avg <= 2.3) return 'II';
  if (avg <= 3.2) return 'III';
  return 'IV';
}

export function EarthGndTool({ mode }: { mode: ToolMode }) {
  const [shared, setShared] = useState<SharedSettings>(DEFAULT_SHARED);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('free');
  const [postcode, setPostcode] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [postcodeLoaded, setPostcodeLoaded] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  const [soilFallback, setSoilFallback] = useState<SoilFallback>('klei');
  const [soil, setSoil] = useState<SoilState>({ lithoClass: null, rho: 125, groundwaterDepth: 2, ph: 6.5 });

  // Ohm inputs
  const [rcdPresent, setRcdPresent] = useState(true);
  const [rcdType, setRcdType] = useState<RcdType>('A');
  const [rcdCurrent, setRcdCurrent] = useState(0.03);
  const [breakerType, setBreakerType] = useState<BreakerType>('B');
  const [breakerAmps, setBreakerAmps] = useState(16);
  const [voltageLimit, setVoltageLimit] = useState<25 | 50>(50);

  // Diepte input
  const [targetResistance, setTargetResistance] = useState(10);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SharedSettings;
      if (parsed.gridSystem && parsed.installationType) {
        setShared(parsed);
      }
    } catch {
      // ignore broken local storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
  }, [shared]);

  const rcdCurrentOptions = rcdType === 'A' ? [0.03, 0.3] : [0.03, 0.1, 0.3, 0.5];

  useEffect(() => {
    if (!rcdCurrentOptions.includes(rcdCurrent)) {
      setRcdCurrent(rcdCurrentOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcdType]);

  const ohmResult = useMemo(() => {
    try {
      return calcOhmWizard({
        customerType: 'zakelijk',
        installationType: shared.installationType,
        gridSystem: shared.gridSystem,
        rcdPresent,
        rcdCurrent: rcdPresent ? rcdCurrent : undefined,
        breakerType,
        breakerAmps,
        voltageLimit,
      });
    } catch {
      return null;
    }
  }, [shared, rcdPresent, rcdCurrent, breakerType, breakerAmps, voltageLimit]);

  const diepteResult = useMemo(() => {
    if (soil.samples?.length) {
      return calcDiepteWithNlLayered({
        targetResistance,
        gwDepth: soil.groundwaterDepth,
        soilSamples: soil.samples,
      });
    }
    const rhoDry = soil.lithoClass ? lithoClassToRhoDry(soil.lithoClass) : undefined;
    const rhoWet = soil.lithoClass ? resolveRhoWet(soil.lithoClass, soil.rho) : undefined;
    return calcDiepte({
      rho: soil.rho,
      targetResistance,
      rodDiameter: 0.014,
      gwDepth: soil.groundwaterDepth,
      rhoDry,
      rhoWet,
    });
  }, [soil, targetResistance]);

  async function loadAddressData() {
    const normalizedPostcode = postcode.replace(/\s/g, '').toUpperCase();
    if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(normalizedPostcode)) {
      setGeoError('Voer een geldige postcode in (bijv. 1012AB).');
      return;
    }

    if (accessLevel === 'pro' && !houseNumber.trim()) {
      setGeoError('Voer ook een huisnummer in voor Pro-lookup.');
      return;
    }

    setGeoLoading(true);
    setGeoError('');

    try {
      const pdokRes = await fetch(
        `/api/pdok?postcode=${encodeURIComponent(normalizedPostcode)}${accessLevel === 'pro' ? `&huisnummer=${encodeURIComponent(houseNumber)}` : ''}`
      );
      const pdok = await pdokRes.json();
      if (!pdokRes.ok || pdok.error) throw new Error(pdok.error ?? 'PDOK lookup mislukt.');

      const broRes = await fetch(
        `/api/bro?rdX=${pdok.rdX}&rdY=${pdok.rdY}&lat=${pdok.lat}&lon=${pdok.lon}`
      );
      const bro = await broRes.json();

      if (!broRes.ok || bro.error) throw new Error(bro.error ?? 'BRO lookup mislukt.');

      if (!bro.hasData) {
        const fallback = MANUAL_SOIL_MAP[soilFallback];
        const gw = typeof bro.groundwaterDepth === 'number' ? bro.groundwaterDepth : null;
        setSoil((prev) => ({
          ...prev,
          lithoClass: fallback.lithoClass,
          rho: pipelineRhoFromManual(fallback.lithoClass, fallback.rho, gw ?? prev.groundwaterDepth),
          samples: undefined,
          groundwaterDepth: gw ?? prev.groundwaterDepth,
          message: 'BRO bevat geen data op deze locatie. Selecteer handmatig de grondsoort.',
          fallbackRequired: true,
        }));
      } else {
        const samples = bro.samples?.map((s: { depth: number; lithoClass: number }) => ({
          depth: Math.abs(s.depth),
          lithoClass: s.lithoClass,
        }));
        const gw = typeof bro.groundwaterDepth === 'number' ? bro.groundwaterDepth : 2;
        const preview = buildSoilRhoPreview({
          samples,
          gwDepth: gw,
          dominantLithoClass: bro.dominantLithoClass,
          dominantRho: bro.dominantRho,
          dataSource: bro.dataSource,
        });
        setSoil((prev) => ({
          ...prev,
          lithoClass: preview.lithoClass ?? bro.dominantLithoClass,
          rho: preview.pipelineRho,
          samples,
          groundwaterDepth: gw,
          ph: bro.estimatedPh ?? prev.ph,
          message: accessLevel === 'free'
            ? 'Upgrade naar Pro voor exacte bodemdata per adres.'
            : 'Exacte bodemdata per adres geladen.',
          fallbackRequired: false,
        }));
      }

      setPostcodeLoaded(true);
    } catch (error) {
      setGeoError(error instanceof Error ? error.message : 'Onbekende fout bij locatiekoppeling.');
      setPostcodeLoaded(false);
    } finally {
      setGeoLoading(false);
    }
  }

  const computedRisk = postcodeLoaded ? riskClass(soil) : null;

  return (
    <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 text-zinc-100">
      <section className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-400">Adres & bodemdata</h2>
        <p className="text-xs text-zinc-300">
          Gratis gebruikt GeoTOP op 500m raster. Pro gebruikt BRO + PDOK op huisnummerniveau.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <select className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}>
            <option value="free">Gratis</option>
            <option value="pro">Pro</option>
          </select>
          <input className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Postcode (1012AB)" />
          <input className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Huisnummer" disabled={accessLevel !== 'pro'} />
          <button onClick={loadAddressData} disabled={geoLoading} className="rounded-lg bg-orange-500 px-3 py-2 font-semibold text-black disabled:opacity-60">
            {geoLoading ? 'Laden…' : 'Data ophalen'}
          </button>
        </div>
        {geoError && <p className="text-sm text-red-400">{geoError}</p>}
        {soil.message && <p className="text-sm text-amber-300">{soil.message}</p>}

        {soil.fallbackRequired && (
          <div className="grid max-w-sm gap-2">
            <label className="text-xs uppercase tracking-wider text-zinc-300">Handmatige grondsoort</label>
            <select
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
              value={soilFallback}
              onChange={(e) => {
                const key = e.target.value as SoilFallback;
                const entry = MANUAL_SOIL_MAP[key];
                setSoilFallback(key);
                setSoil((prev) => ({
                  ...prev,
                  lithoClass: entry.lithoClass,
                  rho: pipelineRhoFromManual(entry.lithoClass, entry.rho, prev.groundwaterDepth),
                  samples: undefined,
                }));
              }}
            >
              {Object.entries(MANUAL_SOIL_MAP).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs">ρ (Ω·m)
            <input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" type="number" value={soil.rho} onChange={(e) => setSoil((prev) => ({ ...prev, rho: Number(e.target.value || 0) }))} />
          </label>
          <label className="text-xs">GHG grondwaterstand (m-mv)
            <input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" type="number" step="0.1" value={soil.groundwaterDepth} onChange={(e) => setSoil((prev) => ({ ...prev, groundwaterDepth: Number(e.target.value || 0) }))} />
          </label>
          <label className="text-xs">pH
            <input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" type="number" step="0.1" value={soil.ph} onChange={(e) => setSoil((prev) => ({ ...prev, ph: Number(e.target.value || 0) }))} />
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <label className="text-xs">Installatietype
          <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={shared.installationType} onChange={(e) => setShared((prev) => ({ ...prev, installationType: e.target.value as InstallationType }))}>
            <option value="woning">Woning</option>
            <option value="utiliteit">Utiliteit</option>
            <option value="industrieel">Industrieel</option>
            <option value="bliksem">Bliksem</option>
            <option value="medisch">Medisch</option>
          </select>
        </label>
        <label className="text-xs">Stelsel
          <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={shared.gridSystem} onChange={(e) => setShared((prev) => ({ ...prev, gridSystem: e.target.value as GridSystem }))}>
            <option value="TT">TT</option>
            <option value="TN">TN</option>
            <option value="IT">IT</option>
          </select>
        </label>
      </section>

      {mode === 'ohm' ? (
        <section className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/40 p-4">
          <h3 className="font-semibold text-orange-300">Ohm tool</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">Aardlek aanwezig?
              <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={rcdPresent ? 'ja' : 'nee'} onChange={(e) => setRcdPresent(e.target.value === 'ja')}>
                <option value="ja">Ja</option>
                <option value="nee">Nee</option>
              </select>
            </label>
            {rcdPresent && (
              <label className="text-xs">Aardlektype (A/B)
                <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={rcdType} onChange={(e) => setRcdType(e.target.value as RcdType)}>
                  <option value="A">Type A</option>
                  <option value="B">Type B</option>
                </select>
              </label>
            )}
            {rcdPresent && (
              <label className="text-xs">IΔn (A)
                <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={rcdCurrent} onChange={(e) => setRcdCurrent(Number(e.target.value))}>
                  {rcdCurrentOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs">Automaatcurve
              <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={breakerType} onChange={(e) => setBreakerType(e.target.value as BreakerType)}>
                <option value="B">B (3-5x In)</option>
                <option value="C">C (5-10x In)</option>
                <option value="D">D (10-20x In)</option>
              </select>
            </label>
            <label className="text-xs">Automaat stroom (A)
              <input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" type="number" value={breakerAmps} onChange={(e) => setBreakerAmps(Number(e.target.value || 0))} />
            </label>
            <label className="text-xs">Aanraakspanning UL
              <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" value={voltageLimit} onChange={(e) => setVoltageLimit(Number(e.target.value) as 25 | 50)}>
                <option value={25}>25V</option>
                <option value={50}>50V</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
            <p className="text-xs text-zinc-300">Vaste aannames op achtergrond: kabellengte 25m, kabeldoorsnede 2.5mm², pendiameter 0.014m, aantal pennen berekend in adviesfase.</p>
            <p className="mt-2 text-2xl font-black text-white">{ohmResult ? `${ohmResult.maxResistance.toFixed(2)} Ω` : 'Vul invoer aan'}</p>
            {ohmResult && <p className="text-xs text-zinc-300">Norm: {ohmResult.norm}</p>}
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/40 p-4">
          <h3 className="font-semibold text-orange-300">Diepte tool</h3>
          <label className="text-xs">Doelweerstand (Ω)
            <input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" type="number" value={targetResistance} onChange={(e) => setTargetResistance(Number(e.target.value || 0))} />
          </label>
          <p className="text-xs text-zinc-300">Pendiameter is vast ingesteld op 0.014m.</p>
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
            <p className="text-2xl font-black text-white">{diepteResult.depth.toFixed(2)} m</p>
            <p className="text-xs text-zinc-300">Gehaalde weerstand: {diepteResult.achievedResistance.toFixed(2)} Ω</p>
          </div>
        </section>
      )}

      {computedRisk && (
        <section className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-4">
          <h3 className="font-semibold">Risicoklasse</h3>
          <p className="mt-1 text-3xl font-black text-orange-300">Klasse {computedRisk}</p>
          <p className="text-xs text-zinc-300">Gebaseerd op rho, GHG en pH van opgehaalde bodemdata.</p>
        </section>
      )}
    </div>
  );
}
