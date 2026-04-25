'use client';

import { useState } from 'react';
import { calcDiepte, calcRiskClass, type DiepteResult } from '@/lib/calculations';
import { PostcodeInput } from './PostcodeInput';
import { useCalculator } from '@/lib/context/CalculatorContext';

const ROD_DIAMETER = 0.014; // fixed: standard 14mm grounding rod

const TARGET_PRESETS = [
  { label: 'Bliksem', value: 10, norm: 'NEN 62305' },
  { label: 'TT-woning', value: 30, norm: 'NEN 1010' },
  { label: 'TT-aardlek', value: 166, norm: 'NEN 1010' },
  { label: 'Utiliteit', value: 5, norm: 'NEN 50522' },
];

function RhoChip({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
        active
          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
          : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500'
      }`}
    >
      <span className="block font-semibold">{label}</span>
      <span className="block text-zinc-500 mt-0.5">{value} Ω·m</span>
    </button>
  );
}

function ResultSection({ result, targetResistance, rho }: { result: DiepteResult; targetResistance: number; rho: number }) {
  const riskClass = calcRiskClass(rho);
  const riskColorMap: Record<string, string> = {
    green: 'border-green-500/40 bg-green-500/5 text-green-400',
    yellow: 'border-yellow-500/40 bg-yellow-500/5 text-yellow-400',
    orange: 'border-orange-500/40 bg-orange-500/5 text-orange-400',
    red: 'border-red-500/40 bg-red-500/5 text-red-400',
  };

  const depthTip =
    result.depth <= 1.5 ? 'Standaard aardpen (1,5 m) volstaat.' :
    result.depth <= 3 ? 'Één langere aardpen (3 m) vereist.' :
    result.depth <= 6 ? 'Meerdere aardpennen parallel aanbevolen.' :
    'Diepboring of aardmat noodzakelijk — advies specialist inwinnen.';

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-b from-orange-500/5 to-zinc-900/80 p-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-orange-500">
        Resultaat
      </div>

      <div className="mb-5 flex items-end gap-2">
        <span className="text-5xl font-black text-white">{result.depth.toFixed(2)}</span>
        <span className="mb-1.5 text-2xl font-light text-zinc-400">m</span>
        <span className="mb-1.5 ml-1 text-sm text-zinc-500">benodigde penlengtte</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500 mb-1">Berekende weerstand</p>
          <p className="font-mono text-lg font-bold text-orange-400">{result.achievedResistance} Ω</p>
          <p className="text-xs text-zinc-600 mt-0.5">doel: ≤ {targetResistance} Ω</p>
        </div>
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500 mb-1">Pendiameter (vast)</p>
          <p className="font-mono text-lg font-bold text-zinc-300">Ø {(ROD_DIAMETER * 1000).toFixed(0)} mm</p>
          <p className="text-xs text-zinc-600 mt-0.5">NEN-standaard</p>
        </div>
      </div>

      {/* Correction factors */}
      <div className="mb-4 rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Correctiefactoren</p>
        <div className="flex gap-4 text-sm">
          <span className="text-zinc-400">Grondwater: <strong className="text-zinc-200">×{result.correctionGroundwater}</strong></span>
          <span className="text-zinc-400">pH: <strong className="text-zinc-200">×{result.correctionPh}</strong></span>
        </div>
      </div>

      {/* Risk class */}
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3 ${riskColorMap[riskClass.color]}`}>
        <span className="shrink-0 font-black text-lg">{riskClass.riskClass}</span>
        <div>
          <p className="text-xs font-semibold">{riskClass.label}</p>
          <p className="mt-0.5 text-xs opacity-80">{riskClass.description}</p>
        </div>
      </div>

      {/* Tip */}
      <div className="flex gap-3 rounded-xl bg-zinc-800/50 p-4">
        <span className="text-xl shrink-0">💡</span>
        <p className="text-sm leading-relaxed text-zinc-300">{depthTip}</p>
      </div>
    </div>
  );
}

export function DiepteCalculator() {
  const { soilData } = useCalculator();

  const [targetResistance, setTargetResistance] = useState(10);
  const [rho, setRho] = useState(125);
  const [groundwaterDepth, setGroundwaterDepth] = useState(3);
  const [ph, setPh] = useState(6.5);
  const [result, setResult] = useState<DiepteResult | null>(null);

  function handleRhoChange(newRho: number) {
    setRho(newRho);
    setResult(null);
  }

  function handleGroundwaterChange(depth: number | null) {
    if (depth != null) {
      setGroundwaterDepth(depth);
      setResult(null);
    }
  }

  function handleCalculate() {
    const res = calcDiepte({
      rho,
      targetResistance,
      rodDiameter: ROD_DIAMETER,
      groundwaterDepth,
      ph,
    });
    setResult(res);
  }

  const activeRho = soilData?.dominantRho ?? rho;

  return (
    <div className="flex flex-col gap-4">
      {/* Postcode / soil lookup */}
      <PostcodeInput onRhoChange={handleRhoChange} onGroundwaterChange={handleGroundwaterChange} />

      {/* Parameters */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
        <h3 className="mb-4 text-sm font-semibold text-zinc-300">Parameters</h3>

        {/* Target resistance presets */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-zinc-500">
            Doelweerstand (Ω)
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-2">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setTargetResistance(p.value); setResult(null); }}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                  targetResistance === p.value
                    ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                    : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-zinc-500 mt-0.5">≤ {p.value} Ω — {p.norm}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={targetResistance}
              onChange={(e) => { setTargetResistance(Number(e.target.value)); setResult(null); }}
              className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
            <span className="text-sm text-zinc-500">Ω  —  handmatig invoeren</span>
          </div>
        </div>

        {/* Soil resistivity (rho) */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-zinc-500">
            Bodemweerstand ρ (Ω·m)
            {soilData && <span className="ml-2 text-green-400">↳ uit BRO: {soilData.dominantRho} Ω·m</span>}
          </label>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 mb-2">
            {[30, 60, 125, 300, 2000, 4000].map((v, i) => (
              <RhoChip
                key={v}
                label={['Klei', 'Leem', 'Zand', 'Dr. zand', 'Veen', 'Rots'][i]}
                value={v}
                active={activeRho === v}
                onClick={() => { setRho(v); setResult(null); }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={activeRho}
              onChange={(e) => { setRho(Number(e.target.value)); setResult(null); }}
              className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
            <span className="text-sm text-zinc-500">Ω·m</span>
          </div>
        </div>

        {/* Groundwater + pH */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-500">
              Grondwaterdiepte (m)
              {soilData?.groundwaterDepth != null && (
                <span className="ml-2 text-green-400">↳ BRO: {soilData.groundwaterDepth.toFixed(1)} m</span>
              )}
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={groundwaterDepth}
              onChange={(e) => { setGroundwaterDepth(Number(e.target.value)); setResult(null); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-500">pH-waarde grond</label>
            <input
              type="number"
              min="0"
              max="14"
              step="0.1"
              value={ph}
              onChange={(e) => { setPh(Number(e.target.value)); setResult(null); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleCalculate}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white transition-opacity hover:bg-orange-400"
        >
          Bereken penlengtte
        </button>
      </div>

      {/* Result */}
      {result && (
        <ResultSection result={result} targetResistance={targetResistance} rho={activeRho} />
      )}
    </div>
  );
}
