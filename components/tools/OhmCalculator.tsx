'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  calcOhmLayers,
  type InstallationType,
  type GridSystem,
  type BreakerType,
  type OhmLayersResult,
} from '@/lib/calculations';

// ─── Types ────────────────────────────────────────────────────────────────────

type StelselType = 'TT' | 'TN';

interface State {
  stelsel: StelselType | null;
  installationType: InstallationType | null;
  rcdMa: number | null;
  tnPreset: string | null;
  voltageLimit: 25 | 50;
}

const TN_PRESETS: { label: string; type: BreakerType; amps: number; desc: string }[] = [
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
  { value: 'woning',     label: 'Woning',            desc: 'NEN 1010' },
  { value: 'utiliteit',  label: 'Utiliteit',          desc: 'NEN 1010' },
  { value: 'industrieel',label: 'Industrieel',         desc: 'NEN 50522' },
  { value: 'bliksem',    label: 'Bliksembeveiliging', desc: 'NEN 62305 — vaste norm ≤ 10 Ω' },
  { value: 'medisch',    label: 'Medisch',             desc: 'NEN 1010 afd. 710 — vaste norm ≤ 0,2 Ω' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtR(r: number): string {
  if (r < 1)   return r.toFixed(2);
  if (r < 10)  return r.toFixed(1);
  if (r < 100) return r.toFixed(1);
  return r.toFixed(0);
}

function statusFromR(r: number): { label: string; color: string } {
  if (r >= 200) return { label: 'Uitstekend haalbaar', color: 'text-green-400' };
  if (r >= 30)  return { label: 'Goed haalbaar',       color: 'text-green-400' };
  if (r >= 5)   return { label: 'Haalbaar',            color: 'text-yellow-400' };
  if (r >= 1)   return { label: 'Uitdagend',           color: 'text-orange-400' };
  return              { label: 'Specialistenwerk',     color: 'text-red-400' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">
      {children}
    </p>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? 'border-[#E8761A] bg-[#E8761A]/15 text-[#E8761A]'
          : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function LayerCard({
  rank,
  label,
  sublabel,
  value,
  unit,
  borderColor,
  highlight,
}: {
  rank: number;
  label: string;
  sublabel: string;
  value: string;
  unit: string;
  borderColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${borderColor} ${highlight ? 'bg-white/5' : 'bg-white/2'}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${highlight ? 'bg-[#E8761A] text-white' : 'bg-white/10 text-white/50'}`}>
          {rank}
        </span>
        <span className="text-xs font-semibold text-white/70">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`font-condensed text-3xl font-black ${highlight ? 'text-[#E8761A]' : 'text-white'}`}>
          {value}
        </span>
        <span className="text-sm text-white/40">{unit}</span>
      </div>
      <p className="mt-1 text-[11px] text-white/40">{sublabel}</p>
    </div>
  );
}

function ThresholdBar({ result }: { result: OhmLayersResult }) {
  const { wettelijkMax, praktischMax, ontwerpdoel, streefwaarde } = result;
  const max = wettelijkMax;

  function pct(v: number) {
    return Math.max(2, Math.min(98, (Math.log10(v + 1) / Math.log10(max + 1)) * 100));
  }

  const zones = [
    { end: pct(streefwaarde), color: 'bg-green-500/70' },
    { end: pct(ontwerpdoel),  color: 'bg-yellow-500/70' },
    { end: pct(praktischMax), color: 'bg-orange-500/70' },
    { end: 100,               color: 'bg-red-500/40' },
  ];

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between text-[10px] text-white/30">
        <span>0 Ω</span>
        <span className="text-white/50 text-xs font-semibold">Schaalverdeling wettelijke norm</span>
        <span>{fmtR(max)} Ω</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/5">
        {(() => {
          let prevEnd = 0;
          return zones.map((zone, i) => {
            const width = zone.end - prevEnd;
            const left = prevEnd;
            prevEnd = zone.end;
            return (
              <div
                key={i}
                className={`absolute top-0 h-full ${zone.color}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          });
        })()}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
        <span className="text-green-400">Streefwaarde</span>
        <span className="text-yellow-400">Ontwerpdoel</span>
        <span className="text-orange-400">Praktisch max</span>
        <span className="text-red-400">Wettelijk max</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OhmCalculator() {
  const [state, setState] = useState<State>({
    stelsel: null,
    installationType: null,
    rcdMa: null,
    tnPreset: null,
    voltageLimit: 50,
  });
  const [result, setResult] = useState<OhmLayersResult | null>(null);
  const [error, setError] = useState('');

  function patch(p: Partial<State>) {
    setState((prev) => ({ ...prev, ...p }));
    setResult(null);
    setError('');
  }

  const isFixed = state.installationType === 'bliksem' || state.installationType === 'medisch';
  const tnPresetObj = TN_PRESETS.find((p) => p.label === state.tnPreset);

  function canCalculate(): boolean {
    if (!state.installationType) return false;
    if (isFixed) return true;
    if (!state.stelsel) return false;
    if (state.stelsel === 'TT' && !state.rcdMa) return false;
    if (state.stelsel === 'TN' && !state.tnPreset) return false;
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
        rcdCurrent: state.stelsel === 'TT' && state.rcdMa ? state.rcdMa / 1000 : undefined,
        breakerType: state.stelsel === 'TN' ? tnPresetObj?.type : undefined,
        breakerAmps: state.stelsel === 'TN' ? tnPresetObj?.amps : undefined,
        voltageLimit: state.voltageLimit,
      });

      setResult(res);
    } catch {
      setError('Onvoldoende gegevens voor berekening. Controleer uw invoer.');
    }
  }

  const status = result ? statusFromR(result.wettelijkMax) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Step 1: Installatietype */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <SectionLabel>Stap 1 — Type installatie</SectionLabel>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {INSTALLATIE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => patch({ installationType: opt.value, stelsel: null, rcdMa: null, tnPreset: null })}
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
                <span className="block text-xs text-white/40 mt-0.5">{opt.desc}</span>
              </span>
              {state.installationType === opt.value && (
                <span className="mt-0.5 shrink-0 text-[#E8761A] text-xs font-bold">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Stelsel (skip for fixed types) */}
      {state.installationType && !isFixed && (
        <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
          <SectionLabel>Stap 2 — Netwerkstelsel</SectionLabel>
          <div className="mb-4 flex gap-2">
            <ToggleChip active={state.stelsel === 'TT'} onClick={() => patch({ stelsel: 'TT', tnPreset: null })}>
              TT-stelsel
            </ToggleChip>
            <ToggleChip active={state.stelsel === 'TN'} onClick={() => patch({ stelsel: 'TN', rcdMa: null })}>
              TN-S stelsel
            </ToggleChip>
          </div>

          {state.stelsel === 'TT' && (
            <>
              <SectionLabel>Aardlekschakelaar (RCD) — IΔn</SectionLabel>
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
                    <span className="text-xs text-white/50">{opt.desc}</span>
                    {state.rcdMa === opt.mA && <span className="ml-auto text-[#E8761A] text-xs font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {state.stelsel === 'TN' && (
            <>
              <SectionLabel>Groepsautomaat — type en ampere</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {TN_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => patch({ tnPreset: preset.label })}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                      state.tnPreset === preset.label
                        ? 'border-[#E8761A] bg-[#E8761A]/8'
                        : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                    }`}
                  >
                    <span className={`font-condensed block text-lg font-black ${state.tnPreset === preset.label ? 'text-[#E8761A]' : 'text-white'}`}>
                      {preset.label}
                    </span>
                    <span className="block text-[10px] text-white/40 mt-0.5">{preset.desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/30">
                Kabelweerstand: 25 m / 2,5 mm² Cu — automatisch verwerkt
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 3: Aanraakspanningsgrens */}
      {state.installationType && !isFixed && state.stelsel && (
        <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
          <SectionLabel>Stap 3 — Aanraakspanningsgrens (UL)</SectionLabel>
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
        className="rounded-2xl bg-[#E8761A] py-4 text-sm font-bold text-white transition-opacity hover:bg-[#d06510] disabled:opacity-30"
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
        <div className="rounded-2xl border border-[#E8761A]/20 bg-gradient-to-b from-[#E8761A]/5 to-transparent p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
              Resultaat — {result.norm}
            </span>
            {status && (
              <span className={`text-xs font-semibold ${status.color}`}>{status.label}</span>
            )}
          </div>

          {/* Four layers */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <LayerCard
              rank={1}
              label="Wettelijk maximum"
              sublabel="NEN absolute grens"
              value={fmtR(result.wettelijkMax)}
              unit="Ω"
              borderColor="border-red-500/20"
            />
            <LayerCard
              rank={2}
              label="Praktisch maximum"
              sublabel="Met 25% veiligheidsmarge"
              value={fmtR(result.praktischMax)}
              unit="Ω"
              borderColor="border-orange-500/20"
            />
            <LayerCard
              rank={3}
              label="Ontwerpdoel"
              sublabel="Aanbevolen voor dit type"
              value={fmtR(result.ontwerpdoel)}
              unit="Ω"
              borderColor="border-yellow-500/20"
              highlight
            />
            <LayerCard
              rank={4}
              label="Streefwaarde"
              sublabel="Beste praktijk"
              value={fmtR(result.streefwaarde)}
              unit="Ω"
              borderColor="border-green-500/20"
            />
          </div>

          {/* Threshold bar */}
          <ThresholdBar result={result} />

          {/* Formula breakdown */}
          <div className="mt-5 rounded-xl border border-white/8 bg-white/3 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/30">Formule</p>
            <p className="mb-3 font-mono text-sm text-[#E8761A]">{result.formula}</p>
            <div className="flex flex-col gap-1">
              {result.formulaSteps.map((step, i) => (
                <div key={i} className="flex gap-2 text-xs text-white/50">
                  <span className="shrink-0 text-white/25">{i + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-5 rounded-xl border border-white/10 bg-white/3 p-4">
            <p className="mb-1 text-sm font-semibold text-white">
              Hoe diep moet de aardpen?
            </p>
            <p className="mb-3 text-xs text-white/50">
              De Pendiepte Calculator berekent de exacte penlengtte op basis van uw bodem, grondwater en pH — onderbouwd met BRO bodemdata.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/pricing"
                className="rounded-lg bg-[#E8761A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d06510] transition-colors"
              >
                Bekijk tarieven
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-white/25 hover:text-white transition-colors"
              >
                Direct 1 credit — 2,95
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
