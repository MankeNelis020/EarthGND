'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { EmailRapportButton } from './EmailRapportButton';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { HeroMetric } from '@/components/ui/instrument';
import {
  calcOhmLayers,
  type InstallationType,
  type GridSystem,
  type BreakerType,
  type OhmLayersResult,
} from '@/lib/calculations';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'wizard' | 'overzicht';
type StelselType = 'TT' | 'TN';

interface State {
  stelsel: StelselType | null;
  installationType: InstallationType | null;
  rcdMa: number | null;
  hasRcd: boolean;
  breakerPreset: string | null;
  voltageLimit: 25 | 50;
}

const BREAKER_FACTOR: Record<BreakerType, number> = { B: 5, C: 10, D: 20 };

const BREAKER_PRESETS: { label: string; type: BreakerType; amps: number; desc: string }[] = [
  { label: 'B10', type: 'B', amps: 10,  desc: 'Verlichting, kleine kring' },
  { label: 'B16', type: 'B', amps: 16,  desc: 'Standaard woning' },
  { label: 'B20', type: 'B', amps: 20,  desc: 'Woning, zware apparatuur' },
  { label: 'B25', type: 'B', amps: 25,  desc: 'Wasmachine, vaatwasser' },
  { label: 'C16', type: 'C', amps: 16,  desc: 'Motorbelasting, TL' },
  { label: 'C25', type: 'C', amps: 25,  desc: 'Grotere motorbelasting' },
  { label: 'C32', type: 'C', amps: 32,  desc: 'Klimaat, grote motoren' },
];

const RCD_OPTIONS: { mA: number; label: string; desc: string }[] = [
  { mA: 30,  label: '30 mA',  desc: 'Persoonsbescherming — woningen' },
  { mA: 100, label: '100 mA', desc: 'Brand / gemengde bescherming' },
  { mA: 300, label: '300 mA', desc: 'Brandbeveiliging — selectief' },
];

const INSTALLATIE_OPTIONS: { value: InstallationType; label: string; desc: string }[] = [
  { value: 'woning',      label: 'Woning',            desc: 'NEN 1010' },
  { value: 'utiliteit',   label: 'Utiliteit',          desc: 'NEN 1010' },
  { value: 'industrieel', label: 'Industrieel',         desc: 'NEN 50522' },
  { value: 'bliksem',     label: 'Bliksembeveiliging', desc: 'NEN 62305 — vaste norm ≤ 10 Ω' },
  { value: 'medisch',     label: 'Medisch',             desc: 'NEN 1010 afd. 710 — vaste norm ≤ 0,2 Ω' },
];

const OVERVIEW_BREAKERS: { type: BreakerType; amps: number }[] = [
  { type: 'B', amps: 10 },
  { type: 'B', amps: 16 },
  { type: 'B', amps: 20 },
  { type: 'B', amps: 25 },
  { type: 'C', amps: 16 },
  { type: 'C', amps: 25 },
  { type: 'C', amps: 32 },
  { type: 'D', amps: 16 },
  { type: 'D', amps: 20 },
  { type: 'D', amps: 25 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtR(r: number): string {
  if (r < 1)   return r.toFixed(2);
  if (r < 100) return r.toFixed(1);
  return r.toFixed(0);
}

function fmtCell(r: number): string {
  if (r >= 1000) return Math.round(r).toString();
  if (r >= 100)  return Math.round(r).toString();
  if (r >= 10)   return r.toFixed(0);
  if (r >= 1)    return r.toFixed(1);
  return r.toFixed(2);
}

function statusFromR(r: number): { label: string; color: string } {
  if (r >= 200) return { label: 'Ruime marge', color: 'text-emerald-400/90' };
  if (r >= 30)  return { label: 'Normaal haalbaar', color: 'text-emerald-400/80' };
  if (r >= 5)   return { label: 'Strak', color: 'text-amber-400/90' };
  if (r >= 1)   return { label: 'Kritisch', color: 'text-brand/90' };
  return              { label: 'Zeer kritisch', color: 'text-red-400/90' };
}

function cellTextColor(r: number): string {
  if (r >= 30) return 'text-green-400';
  if (r >= 5)  return 'text-yellow-400';
  if (r >= 1)  return 'text-orange-400';
  return 'text-red-400';
}

function cellBg(r: number): string {
  if (r >= 30) return '';
  if (r >= 5)  return 'bg-yellow-500/4';
  if (r >= 1)  return 'bg-orange-500/6';
  return 'bg-red-500/8';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`choice-chip ${active ? 'choice-chip-active' : ''}`}
    >
      {children}
    </button>
  );
}

function SpecRow({ label, sublabel, value, highlight }: {
  label: string; sublabel: string; value: string; highlight?: boolean;
}) {
  return (
    <tr className={highlight ? 'bg-brand-muted' : undefined}>
      <td className="py-2.5 pr-4 align-top">
        <span className="block text-xs font-medium text-white/75">{label}</span>
        <span className="block text-[10px] text-white/40">{sublabel}</span>
      </td>
      <td className="py-2.5 text-right align-top">
        <span className={`font-mono text-sm font-semibold tabular-nums ${highlight ? 'text-brand' : 'text-white'}`}>
          {value}
        </span>
        <span className="ml-0.5 text-xs text-white/45">Ω</span>
      </td>
    </tr>
  );
}

function ThresholdBar({ result }: { result: OhmLayersResult }) {
  const { wettelijkMax, praktischMax, ontwerpdoel, streefwaarde } = result;
  const max = wettelijkMax;

  function pct(v: number) {
    return Math.max(2, Math.min(98, (Math.log10(v + 1) / Math.log10(max + 1)) * 100));
  }

  const zones = [
    { end: pct(streefwaarde), color: 'bg-white/20' },
    { end: pct(ontwerpdoel),  color: 'bg-white/28' },
    { end: pct(praktischMax), color: 'bg-brand/35' },
    { end: 100,               color: 'bg-brand/55' },
  ];

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between text-[10px] text-white/45">
        <span>0 Ω</span>
        <span className="text-xs font-medium text-white/55">Schaal t.o.v. wettelijk maximum</span>
        <span>{fmtR(max)} Ω</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-sm bg-white/6">
        {(() => {
          let prevEnd = 0;
          return zones.map((zone, i) => {
            const width = zone.end - prevEnd;
            const left = prevEnd;
            prevEnd = zone.end;
            return <div key={i} className={`absolute top-0 h-full ${zone.color}`} style={{ left: `${left}%`, width: `${width}%` }} />;
          });
        })()}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-white/45 sm:grid-cols-4">
        <span>Streefwaarde</span>
        <span>Ontwerpdoel</span>
        <span>Praktisch max</span>
        <span>Wettelijk max</span>
      </div>
    </div>
  );
}

// ─── Resistance Overview ──────────────────────────────────────────────────────

function ResistanceOverview() {
  const [voltageLimit, setVoltageLimit] = useState<25 | 50>(50);
  const UL = voltageLimit;

  // Ra_max = UL/IΔn — geen universele 166-cap (zie docs/contracts.md §A)
  const rcdCols = RCD_OPTIONS.map(rcd => ({
    ...rcd,
    r: UL / (rcd.mA / 1000),
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* UL toggle */}
      <div className="panel p-5">
        <FieldLabel>Aanraakspanningsgrens (UL)</FieldLabel>
        <div className="flex gap-2">
          <ToggleChip active={voltageLimit === 50} onClick={() => setVoltageLimit(50)}>
            50 V — droge ruimte
          </ToggleChip>
          <ToggleChip active={voltageLimit === 25} onClick={() => setVoltageLimit(25)}>
            25 V — vochtig / buiten
          </ToggleChip>
        </div>
        <p className="mt-3 text-[11px] text-white/60">
          TT-stelsel · NEN 1010 · Zonder aardlek: R ≤ UL / (n × In) · Met aardlek: R ≤ UL / IΔn
        </p>
      </div>

      {/* Reference table */}
      <div className="panel overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-white/6">
          <FieldLabel>Maximale aardingsweerstand (Ω) — TT-stelsel</FieldLabel>
          <p className="text-[11px] text-white/70">
            Kies de automaat en lees af hoeveel weerstand de aarding maximaal mag hebben.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/2">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-white/70 whitespace-nowrap">
                  Automaat
                </th>
                <th className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-red-400/80">Zonder aardlek</span>
                  <span className="block text-[9px] text-white/70 mt-0.5">R ≤ UL / (n × In)</span>
                </th>
                {rcdCols.map(col => (
                  <th key={col.mA} className="px-4 py-3 text-center whitespace-nowrap">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-green-400/70">{col.label} aardlek</span>
                    <span className={`block font-condensed text-base font-bold mt-0.5 ${cellTextColor(col.r)}`}>
                      {fmtCell(col.r)} <span className="text-[10px] font-normal text-white/70">Ω</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OVERVIEW_BREAKERS.map((breaker, i) => {
                const Ia = BREAKER_FACTOR[breaker.type] * breaker.amps;
                const rWithout = UL / Ia;
                return (
                  <tr key={i} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-condensed text-lg font-black text-white">{breaker.type} {breaker.amps}</span>
                      <span className="ml-1 text-xs text-white/70">A</span>
                    </td>
                    <td className={`px-4 py-3 text-center ${cellBg(rWithout)}`}>
                      <span className={`font-condensed text-xl font-bold ${cellTextColor(rWithout)}`}>
                        {fmtCell(rWithout)}
                      </span>
                      <span className="ml-1 text-[10px] text-white/70">Ω</span>
                    </td>
                    {rcdCols.map((col, j) => (
                      <td key={j} className={`px-4 py-3 text-center ${cellBg(col.r)}`}>
                        <span className={`font-condensed text-xl font-bold ${cellTextColor(col.r)}`}>
                          {fmtCell(col.r)}
                        </span>
                        <span className="ml-1 text-[10px] text-white/70">Ω</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-5 py-4 border-t border-white/4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px]">
            <span><span className="font-bold text-green-400">groen</span><span className="text-white/70"> ≥ 30 Ω — goed haalbaar</span></span>
            <span><span className="font-bold text-yellow-400">geel</span><span className="text-white/70"> 5–30 Ω — haalbaar</span></span>
            <span><span className="font-bold text-orange-400">oranje</span><span className="text-white/70"> 1–5 Ω — uitdagend</span></span>
            <span><span className="font-bold text-red-400">rood</span><span className="text-white/70"> &lt;1 Ω — specialistenwerk</span></span>
          </div>
          <p className="mt-2 text-[10px] text-white/70">
            Type B: factor ×5 · Type C: factor ×10 · Type D: factor ×20 · UL = {UL} V
          </p>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
        <p className="text-xs font-semibold text-orange-300">TT-stelsel zonder aardlekschakelaar</p>
        <p className="mt-1 text-[11px] text-white/60 leading-relaxed">
          Zonder aardlek zijn de vereiste aardingsweerstanden in een TT-stelsel altijd &lt;1 Ω — in de praktijk nauwelijks haalbaar
          zonder specialistische installatie (aardmat, diepboring). NEN 1010 vereist voor de meeste toepassingen een aardlekschakelaar.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OhmCalculator() {
  const [view, setView] = useState<ViewMode>('wizard');
  const [state, setState] = useState<State>({
    stelsel: null,
    installationType: null,
    rcdMa: null,
    hasRcd: true,
    breakerPreset: null,
    voltageLimit: 50,
  });
  const [result, setResult] = useState<OhmLayersResult | null>(null);
  const [error, setError] = useState('');

  // Restore calculation from sessionStorage after a login redirect
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('earthgnd:weerstand:v1');
      if (saved) {
        const { state: s, result: r } = JSON.parse(saved) as { state: State; result: OhmLayersResult };
        setState(s);
        setResult(r);
      }
    } catch { /* ignore parse errors */ }
  }, []);

  // Persist result so it survives a login redirect
  useEffect(() => {
    if (!result) return;
    try {
      sessionStorage.setItem('earthgnd:weerstand:v1', JSON.stringify({ state, result }));
    } catch { /* storage quota or private mode */ }
  }, [result, state]);

  function patch(p: Partial<State>) {
    setState((prev) => ({ ...prev, ...p }));
    setResult(null);
    setError('');
  }

  const isFixed = state.installationType === 'bliksem' || state.installationType === 'medisch';
  const breakerPresetObj = BREAKER_PRESETS.find((p) => p.label === state.breakerPreset);
  const needsBreaker = state.stelsel === 'TN' || (state.stelsel === 'TT' && !state.hasRcd);

  function canCalculate(): boolean {
    if (!state.installationType) return false;
    if (isFixed) return true;
    if (!state.stelsel) return false;
    if (state.stelsel === 'TT' && state.hasRcd && !state.rcdMa) return false;
    if (state.stelsel === 'TT' && !state.hasRcd && !state.breakerPreset) return false;
    if (state.stelsel === 'TN' && !state.breakerPreset) return false;
    return true;
  }

  function handleCalculate() {
    if (!canCalculate() || !state.installationType) return;
    setError('');
    try {
      const gridSystem: GridSystem = isFixed ? 'TT' : (state.stelsel as GridSystem);
      const res = calcOhmLayers({
        installationType: state.installationType,
        gridSystem,
        rcdCurrent: state.stelsel === 'TT' && state.hasRcd && state.rcdMa ? state.rcdMa / 1000 : undefined,
        breakerType: needsBreaker ? breakerPresetObj?.type : undefined,
        breakerAmps: needsBreaker ? breakerPresetObj?.amps : undefined,
        voltageLimit: state.voltageLimit,
      });
      setResult(res);
    } catch {
      setError('Onvoldoende gegevens voor berekening. Controleer uw invoer.');
    }
  }

  const status = result ? statusFromR(result.wettelijkMax) : null;

  return (
    <div className="flex flex-col gap-section">
      {/* View tabs */}
      <div className="flex gap-1.5 panel p-1.5">
        {(['wizard', 'overzicht'] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-input py-2.5 text-sm font-semibold transition-colors duration-fast ${
              view === v ? 'bg-brand text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            {v === 'wizard' ? 'Bereken' : 'Overzicht'}
          </button>
        ))}
      </div>

      {view === 'overzicht' ? <ResistanceOverview /> : (
        <>
          {/* Step 1: Installatietype */}
          <div className="panel p-5">
            <FieldLabel>Stap 1 — Type installatie</FieldLabel>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {INSTALLATIE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => patch({ installationType: opt.value, stelsel: null, rcdMa: null, breakerPreset: null, hasRcd: true })}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    state.installationType === opt.value
                      ? 'border-[#E8761A] bg-[#E8761A]/8'
                      : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                  }`}
                >
                  <span className="flex-1">
                    <span className={`block text-sm font-semibold ${state.installationType === opt.value ? 'text-[#E8761A]' : 'text-white'}`}>
                      {opt.label}
                    </span>
                    <span className="block text-xs text-white/60 mt-0.5">{opt.desc}</span>
                  </span>
                  {state.installationType === opt.value && (
                    <span className="mt-0.5 shrink-0 text-[#E8761A] text-xs font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Stelsel + beveiliging */}
          {state.installationType && !isFixed && (
            <div className="panel p-5">
              <FieldLabel>Stap 2 — Netwerkstelsel</FieldLabel>
              <div className="mb-4 flex gap-2">
                <ToggleChip active={state.stelsel === 'TT'} onClick={() => patch({ stelsel: 'TT', breakerPreset: null, hasRcd: true })}>
                  TT-stelsel
                </ToggleChip>
                <ToggleChip active={state.stelsel === 'TN'} onClick={() => patch({ stelsel: 'TN', rcdMa: null, hasRcd: false })}>
                  TN-S stelsel
                </ToggleChip>
              </div>

              {state.stelsel === 'TT' && (
                <>
                  <FieldLabel>Aardlekschakelaar (RCD)</FieldLabel>
                  <div className="mb-4 flex gap-2">
                    <ToggleChip active={state.hasRcd} onClick={() => patch({ hasRcd: true, breakerPreset: null })}>
                      Met aardlek
                    </ToggleChip>
                    <ToggleChip active={!state.hasRcd} onClick={() => patch({ hasRcd: false, rcdMa: null })}>
                      Zonder aardlek
                    </ToggleChip>
                  </div>

                  {state.hasRcd && (
                    <>
                      <FieldLabel>IΔn — nominale aardlekstroom</FieldLabel>
                      <div className="flex flex-col gap-1.5">
                        {RCD_OPTIONS.map((opt) => (
                          <button
                            key={opt.mA}
                            onClick={() => patch({ rcdMa: opt.mA })}
                            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                              state.rcdMa === opt.mA
                                ? 'border-[#E8761A] bg-[#E8761A]/8'
                                : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                            }`}
                          >
                            <span className={`font-condensed text-base font-bold ${state.rcdMa === opt.mA ? 'text-[#E8761A]' : 'text-white'}`}>
                              {opt.label}
                            </span>
                            <span className="text-xs text-white/70">{opt.desc}</span>
                            {state.rcdMa === opt.mA && <span className="ml-auto text-[#E8761A] text-xs font-bold">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {!state.hasRcd && (
                    <>
                      <div className="mb-3 rounded-xl border border-orange-500/25 bg-orange-500/5 px-4 py-3">
                        <p className="text-[11px] text-orange-300/90 leading-relaxed">
                          Zonder aardlekschakelaar in een TT-stelsel is de vereiste aardingsweerstand doorgaans &lt;1 Ω.
                          Dit is in de praktijk nauwelijks haalbaar zonder specialistische aarding.
                        </p>
                      </div>
                      <FieldLabel>Groepsautomaat — type en ampere</FieldLabel>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {BREAKER_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => patch({ breakerPreset: preset.label })}
                            className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                              state.breakerPreset === preset.label
                                ? 'border-[#E8761A] bg-[#E8761A]/8'
                                : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                            }`}
                          >
                            <span className={`font-condensed block text-lg font-black ${state.breakerPreset === preset.label ? 'text-[#E8761A]' : 'text-white'}`}>
                              {preset.label}
                            </span>
                            <span className="block text-[10px] text-white/60 mt-0.5">{preset.desc}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {state.stelsel === 'TN' && (
                <>
                  <FieldLabel>Groepsautomaat — type en ampere</FieldLabel>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {BREAKER_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => patch({ breakerPreset: preset.label })}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                          state.breakerPreset === preset.label
                            ? 'border-[#E8761A] bg-[#E8761A]/8'
                            : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                        }`}
                      >
                        <span className={`font-condensed block text-lg font-black ${state.breakerPreset === preset.label ? 'text-[#E8761A]' : 'text-white'}`}>
                          {preset.label}
                        </span>
                        <span className="block text-[10px] text-white/60 mt-0.5">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-white/70">
                    Kabelweerstand: 25 m / 2,5 mm² Cu — automatisch verwerkt
                  </p>
                </>
              )}
            </div>
          )}

          {/* Step 3: Aanraakspanningsgrens */}
          {state.installationType && !isFixed && state.stelsel && (
            <div className="panel p-5">
              <FieldLabel>Stap 3 — Aanraakspanningsgrens (UL)</FieldLabel>
              <div className="flex gap-2">
                <ToggleChip active={state.voltageLimit === 50} onClick={() => patch({ voltageLimit: 50 })}>
                  50 V — droge ruimte
                </ToggleChip>
                <ToggleChip active={state.voltageLimit === 25} onClick={() => patch({ voltageLimit: 25 })}>
                  25 V — vochtig / buiten
                </ToggleChip>
              </div>
            </div>
          )}

          {/* Calculate button */}
          <button
            onClick={handleCalculate}
            disabled={!canCalculate()}
            className="btn-primary"
          >
            Bereken maximale aardingsweerstand
          </button>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Result */}
          {result && (
            <div className="flex flex-col gap-section result-block">
              <HeroMetric
                label="Ontwerpdoel"
                value={fmtR(result.ontwerpdoel)}
                unit="Ω"
                context={result.norm}
                pulseKey={result.ontwerpdoel}
              />

              <div className="surface-panel p-gutter">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
                <span className="type-label">Drempelwaarden</span>
                {status && <span className={`type-value ${status.color}`}>{status.label}</span>}
              </div>

              <table className="mt-4 w-full border-t border-white/8">
                <tbody>
                  <SpecRow label="Wettelijk maximum" sublabel="NEN absolute grens" value={fmtR(result.wettelijkMax)} />
                  <SpecRow label="Praktisch maximum" sublabel="Met 25% veiligheidsmarge" value={fmtR(result.praktischMax)} />
                  <SpecRow label="Ontwerpdoel" sublabel="Aanbevolen voor dit type" value={fmtR(result.ontwerpdoel)} highlight />
                  <SpecRow label="Streefwaarde" sublabel="Beste praktijk" value={fmtR(result.streefwaarde)} />
                </tbody>
              </table>

              <ThresholdBar result={result} />

              <div className="mt-5 rounded-lg border border-white/8 bg-white/3 p-4">
                <p className="mb-2 text-xs font-medium text-white/50">Formule</p>
                <p className="mb-3 font-mono text-sm text-brand">{result.formula}</p>
                <div className="flex flex-col gap-1">
                  {result.formulaSteps.map((step, i) => (
                    <div key={i} className="flex gap-2 text-xs text-white/70">
                      <span className="shrink-0 text-white/60">{i + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-brand/20 bg-brand-muted p-4">
                <p className="mb-1 text-sm font-semibold text-white">Hoe diep moet de aardpen?</p>
                <p className="mb-3 text-xs text-white/60 leading-relaxed">
                  De Pendiepte Calculator berekent de exacte penlengte voor Ra ≤ {fmtR(result.ontwerpdoel)} Ω
                  op basis van uw locatie en BRO bodemdata. Inclusief Ra-haalbaarheidscheck.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/tool/diepte?target=${result.ontwerpdoel}&label=${encodeURIComponent(result.norm)}`}
                    className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover transition-colors"
                  >
                    Bereken pendiepte voor Ra ≤ {fmtR(result.ontwerpdoel)} Ω
                  </Link>
                  <Link href="/pricing" className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-white/25 hover:text-white transition-colors">
                    Tarieven & credits
                  </Link>
                </div>
              </div>

              <EmailRapportButton
                tool="ohm"
                inputValues={{
                  'Installatietype': INSTALLATIE_OPTIONS.find((t) => t.value === state.installationType)?.label ?? (state.installationType ?? '-'),
                  'Netwerkstelsel': state.stelsel ?? '-',
                  ...(state.stelsel === 'TT' ? { 'Aardlekschakelaar': state.hasRcd ? 'Ja' : 'Nee' } : {}),
                  ...(state.rcdMa ? { 'Aardlek (mA)': state.rcdMa } : {}),
                  ...(state.breakerPreset ? { 'Groepsautomaat': state.breakerPreset } : {}),
                  'Aanraakvoltage': `${state.voltageLimit} V`,
                }}
                results={{
                  'Norm': result.norm,
                  'Wettelijk maximum': `${fmtR(result.wettelijkMax)} Ω`,
                  'Praktisch maximum': `${fmtR(result.praktischMax)} Ω`,
                  'Ontwerpdoel': `${fmtR(result.ontwerpdoel)} Ω`,
                  'Streefwaarde': `${fmtR(result.streefwaarde)} Ω`,
                }}
              />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
