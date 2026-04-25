'use client';

import { useState } from 'react';
import {
  calcOhmWizard,
  calcRiskClass,
  type CustomerType,
  type InstallationType,
  type GridSystem,
  type BreakerType,
  type OhmWizardResult,
} from '@/lib/calculations';
import { PostcodeInput } from './PostcodeInput';
import { useCalculator } from '@/lib/context/CalculatorContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId =
  | 'customerType'
  | 'installationType'
  | 'gridSystem'
  | 'rcdPresent'
  | 'rcdCurrent'
  | 'breaker'
  | 'voltageLimit';

interface WizardState {
  customerType: CustomerType | null;
  installationType: InstallationType | null;
  gridSystem: GridSystem | null;
  rcdPresent: boolean | null;
  rcdCurrent: number | null;
  breakerType: BreakerType | null;
  breakerAmps: string;
  voltageLimit: 25 | 50 | null;
}

const EMPTY: WizardState = {
  customerType: null,
  installationType: null,
  gridSystem: null,
  rcdPresent: null,
  rcdCurrent: null,
  breakerType: null,
  breakerAmps: '',
  voltageLimit: null,
};

// ─── Step sequence ────────────────────────────────────────────────────────────

function getSteps(s: WizardState): StepId[] {
  const steps: StepId[] = ['customerType', 'installationType'];
  if (!s.installationType) return steps;
  if (s.installationType === 'bliksem' || s.installationType === 'medisch') return steps;

  steps.push('gridSystem');
  if (!s.gridSystem) return steps;

  steps.push('rcdPresent');
  if (s.rcdPresent === null) return steps;

  if (s.rcdPresent) steps.push('rcdCurrent');

  // Breaker needed: TN always, or any stelsel without RCD
  if (s.gridSystem === 'TN' || !s.rcdPresent) steps.push('breaker');

  steps.push('voltageLimit');
  return steps;
}

function isComplete(step: StepId, s: WizardState): boolean {
  switch (step) {
    case 'customerType':    return s.customerType !== null;
    case 'installationType':return s.installationType !== null;
    case 'gridSystem':      return s.gridSystem !== null;
    case 'rcdPresent':      return s.rcdPresent !== null;
    case 'rcdCurrent':      return s.rcdCurrent !== null;
    case 'breaker':         return s.breakerType !== null && s.breakerAmps.trim() !== '';
    case 'voltageLimit':    return s.voltageLimit !== null;
  }
}

function getActive(s: WizardState): StepId | 'result' {
  const steps = getSteps(s);
  for (const step of steps) {
    if (!isComplete(step, s)) return step;
  }
  return 'result';
}

function defaultGrid(s: WizardState): GridSystem {
  if (s.customerType === 'particulier') return 'TT';
  if (s.installationType === 'industrieel') return 'TN';
  return 'TT';
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Opt({
  onClick,
  active,
  icon,
  label,
  sub,
}: {
  onClick: () => void;
  active?: boolean;
  icon: string;
  label: string;
  sub?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
        active
          ? 'border-orange-500 bg-orange-500/10'
          : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 hover:bg-zinc-800'
      }`}
    >
      <span className="mt-0.5 text-xl shrink-0">{icon}</span>
      <span>
        <span className={`block text-sm font-semibold ${active ? 'text-orange-400' : 'text-zinc-100'}`}>
          {label}
        </span>
        {sub && <span className="block text-xs text-zinc-500 mt-0.5">{sub}</span>}
      </span>
      {active && <span className="ml-auto shrink-0 text-orange-500">✓</span>}
    </button>
  );
}

function Chip({
  onClick,
  active,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-2 px-5 py-2.5 text-sm font-semibold transition-all ${
        active
          ? 'border-orange-500 bg-orange-500/15 text-orange-400'
          : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500'
      }`}
    >
      {label}
    </button>
  );
}

function StepBadge({ n, total }: { n: number; total: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
        {n}
      </span>
      <span className="text-xs text-zinc-500">Stap {n} van {total}</span>
      <div className="ml-auto flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 w-6 rounded-full transition-colors ${i < n ? 'bg-orange-500' : 'bg-zinc-700'}`}
          />
        ))}
      </div>
    </div>
  );
}

function DoneRow({
  stepNum,
  label,
  value,
  onEdit,
}: {
  stepNum: number;
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">
        {stepNum}
      </span>
      <span className="text-xs text-zinc-500">{label}:</span>
      <span className="text-sm font-medium text-zinc-200">{value}</span>
      <button
        onClick={onEdit}
        className="ml-auto text-xs text-zinc-600 hover:text-orange-400 transition-colors"
      >
        wijzigen
      </button>
    </div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, onReset, rho }: { result: OhmWizardResult; onReset: () => void; rho: number | null }) {
  const r = result.maxResistance;
  const display =
    r < 1 ? r.toFixed(2) : r < 10 ? r.toFixed(1) : r >= 1000 ? r.toFixed(0) : r.toFixed(1);

  const riskClass = rho != null ? calcRiskClass(rho) : null;
  const riskColorMap: Record<string, string> = {
    green: 'border-green-500/40 bg-green-500/5 text-green-400',
    yellow: 'border-yellow-500/40 bg-yellow-500/5 text-yellow-400',
    orange: 'border-orange-500/40 bg-orange-500/5 text-orange-400',
    red: 'border-red-500/40 bg-red-500/5 text-red-400',
  };

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-b from-orange-500/5 to-zinc-900/80 p-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-orange-500">
        Resultaat
      </div>
      <div className="mb-5 flex items-end gap-2">
        <span className="text-5xl font-black text-white">{display}</span>
        <span className="mb-1.5 text-2xl font-light text-zinc-400">Ω</span>
        <span className="mb-1.5 ml-1 text-sm text-zinc-500">maximale aardingsweerstand</span>
      </div>

      {/* Formula breakdown */}
      <div className="mb-4 rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Formule</p>
        <p className="mb-3 font-mono text-sm text-orange-300">{result.formula}</p>
        <div className="flex flex-col gap-1">
          {result.formulaSteps.map((step, i) => (
            <div key={i} className="flex gap-2 text-xs text-zinc-400">
              <span className="shrink-0 text-zinc-600">{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Norm */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-700/40 bg-zinc-800/40 px-3 py-2">
        <span className="text-xs text-zinc-500">Norm:</span>
        <span className="text-sm font-semibold text-zinc-200">{result.norm}</span>
      </div>

      {/* Risk class */}
      {riskClass && (
        <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3 ${riskColorMap[riskClass.color]}`}>
          <span className="shrink-0 font-black text-lg">{riskClass.riskClass}</span>
          <div>
            <p className="text-xs font-semibold">{riskClass.label}</p>
            <p className="mt-0.5 text-xs opacity-80">{riskClass.description}</p>
          </div>
        </div>
      )}

      {/* Practical indication */}
      <div className="mb-5 flex gap-3 rounded-xl bg-zinc-800/50 p-4">
        <span className="text-xl shrink-0">💡</span>
        <p className="text-sm leading-relaxed text-zinc-300">{result.indication}</p>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-orange-500/50 hover:text-orange-400"
      >
        Nieuwe berekening
      </button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function OhmCalculator() {
  const { soilData } = useCalculator();
  const [state, setState] = useState<WizardState>(EMPTY);
  const [editingStep, setEditingStep] = useState<StepId | null>(null);

  function set(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }));
    setEditingStep(null);
  }

  function resetFrom(step: StepId) {
    const resetMap: Record<StepId, Partial<WizardState>> = {
      customerType:     { customerType: null, installationType: null, gridSystem: null, rcdPresent: null, rcdCurrent: null, breakerType: null, breakerAmps: '', voltageLimit: null },
      installationType: { installationType: null, gridSystem: null, rcdPresent: null, rcdCurrent: null, breakerType: null, breakerAmps: '', voltageLimit: null },
      gridSystem:       { gridSystem: null, rcdPresent: null, rcdCurrent: null, breakerType: null, breakerAmps: '', voltageLimit: null },
      rcdPresent:       { rcdPresent: null, rcdCurrent: null, breakerType: null, breakerAmps: '', voltageLimit: null },
      rcdCurrent:       { rcdCurrent: null, voltageLimit: null },
      breaker:          { breakerType: null, breakerAmps: '', voltageLimit: null },
      voltageLimit:     { voltageLimit: null },
    };
    setState((prev) => ({ ...prev, ...resetMap[step] }));
    setEditingStep(step);
  }

  const steps = getSteps(state);
  const active = editingStep ?? getActive(state);
  const totalSteps = steps.length;

  // Completed steps to show above active
  const completedSteps = steps.filter(
    (s) => isComplete(s, state) && s !== active
  );

  const stepIndex = (step: StepId) => steps.indexOf(step) + 1;

  const labelMap: Record<StepId, string> = {
    customerType:     'Klanttype',
    installationType: 'Installatie',
    gridSystem:       'Stelsel',
    rcdPresent:       'Aardlek',
    rcdCurrent:       'IΔn',
    breaker:          'Automaat',
    voltageLimit:     'Spanningsgrens',
  };

  function valueOf(step: StepId): string {
    switch (step) {
      case 'customerType':     return state.customerType === 'particulier' ? 'Particulier' : 'Zakelijk';
      case 'installationType': return { woning: 'Woning', utiliteit: 'Utiliteit', industrieel: 'Industrieel', bliksem: 'Bliksembeveiliging', medisch: 'Medisch' }[state.installationType!] ?? '';
      case 'gridSystem':       return state.gridSystem ?? '';
      case 'rcdPresent':       return state.rcdPresent ? 'Ja' : 'Nee';
      case 'rcdCurrent':       return `${(state.rcdCurrent ?? 0) * 1000} mA`;
      case 'breaker':          return `Type ${state.breakerType} — ${state.breakerAmps} A`;
      case 'voltageLimit':     return `${state.voltageLimit} V`;
    }
  }

  // Compute result if wizard is complete
  let result: OhmWizardResult | null = null;
  if (active === 'result') {
    try {
      result = calcOhmWizard({
        customerType: state.customerType!,
        installationType: state.installationType!,
        gridSystem: state.gridSystem ?? undefined,
        rcdPresent: state.rcdPresent ?? undefined,
        rcdCurrent: state.rcdCurrent ?? undefined,
        breakerType: state.breakerType ?? undefined,
        breakerAmps: state.breakerAmps ? Number(state.breakerAmps) : undefined,
        voltageLimit: state.voltageLimit ?? undefined,
      });
    } catch {
      result = null;
    }
  }

  const activeRho = soilData?.dominantRho ?? null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* Postcode / soil section */}
      <PostcodeInput />

      {/* Completed steps summary */}
      {completedSteps.map((step) => (
        <DoneRow
          key={step}
          stepNum={stepIndex(step)}
          label={labelMap[step]}
          value={valueOf(step)}
          onEdit={() => resetFrom(step)}
        />
      ))}

      {/* Active step card */}
      {active !== 'result' && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
          <StepBadge n={stepIndex(active)} total={totalSteps} />

          {/* ── STEP: customerType ─────────────────────────────────────────── */}
          {active === 'customerType' && (
            <>
              <h3 className="mb-4 text-base font-semibold text-white">Particulier of zakelijk?</h3>
              <div className="flex flex-col gap-2.5">
                <Opt
                  onClick={() => set({ customerType: 'particulier' })}
                  active={state.customerType === 'particulier'}
                  icon="🏠"
                  label="Particulier"
                  sub="Woning, tuin — doorgaans TT-stelsel"
                />
                <Opt
                  onClick={() => set({ customerType: 'zakelijk' })}
                  active={state.customerType === 'zakelijk'}
                  icon="🏢"
                  label="Zakelijk"
                  sub="Bedrijf, utiliteit, industrie"
                />
              </div>
            </>
          )}

          {/* ── STEP: installationType ─────────────────────────────────────── */}
          {active === 'installationType' && (
            <>
              <h3 className="mb-4 text-base font-semibold text-white">Type installatie</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Opt onClick={() => set({ installationType: 'woning' })}       active={state.installationType === 'woning'}       icon="🏠" label="Woning / Appartement" sub="NEN 1010" />
                <Opt onClick={() => set({ installationType: 'utiliteit' })}    active={state.installationType === 'utiliteit'}    icon="🏢" label="Utiliteit"             sub="NEN 1010" />
                <Opt onClick={() => set({ installationType: 'industrieel' })}  active={state.installationType === 'industrieel'}  icon="🏭" label="Industrieel"           sub="NEN 1010 / NEN 50522" />
                <Opt onClick={() => set({ installationType: 'bliksem' })}      active={state.installationType === 'bliksem'}      icon="⚡" label="Bliksembeveiliging"    sub="NEN 62305 — vaste norm: ≤ 10 Ω" />
                <Opt onClick={() => set({ installationType: 'medisch' })}      active={state.installationType === 'medisch'}      icon="🏥" label="Medisch"               sub="NEN 1010 afd. 710 — vaste norm: ≤ 0,2 Ω" />
              </div>
            </>
          )}

          {/* ── STEP: gridSystem ──────────────────────────────────────────── */}
          {active === 'gridSystem' && (
            <>
              <h3 className="mb-1 text-base font-semibold text-white">Type stelsel</h3>
              <p className="mb-4 text-xs text-zinc-500">
                Vooringevuld op basis van uw keuzes — aanpasbaar.
              </p>
              <div className="flex flex-col gap-2.5">
                <Opt
                  onClick={() => set({ gridSystem: 'TT' })}
                  active={state.gridSystem === 'TT' || (state.gridSystem === null && defaultGrid(state) === 'TT')}
                  icon="🌍"
                  label="TT-stelsel"
                  sub="Eigen aardpen — gebruikelijk bij woningen in Nederland"
                />
                <Opt
                  onClick={() => set({ gridSystem: 'TN' })}
                  active={state.gridSystem === 'TN' || (state.gridSystem === null && defaultGrid(state) === 'TN')}
                  icon="⚙️"
                  label="TN-stelsel"
                  sub="Netaarde — gebruikelijk bij bedrijfsinstallaties"
                />
                <Opt
                  onClick={() => set({ gridSystem: 'IT' })}
                  active={state.gridSystem === 'IT'}
                  icon="🔒"
                  label="IT-stelsel"
                  sub="Geïsoleerd net — medisch, industrie"
                />
              </div>
              {state.gridSystem === null && (
                <p className="mt-3 text-xs text-orange-400/70">
                  Aanbevolen voor uw situatie: <strong>{defaultGrid(state)}</strong>
                </p>
              )}
            </>
          )}

          {/* ── STEP: rcdPresent ──────────────────────────────────────────── */}
          {active === 'rcdPresent' && (
            <>
              <h3 className="mb-1 text-base font-semibold text-white">Aardlek aanwezig?</h3>
              <p className="mb-4 text-xs text-zinc-500">
                Een aardlekschakelaar (RCD/ALS) beschermt tegen gevaarlijke aardlekstroom.
              </p>
              <div className="flex gap-3">
                <Opt onClick={() => set({ rcdPresent: true })}  active={state.rcdPresent === true}  icon="✅" label="Ja" />
                <Opt onClick={() => set({ rcdPresent: false })} active={state.rcdPresent === false} icon="❌" label="Nee" />
              </div>
            </>
          )}

          {/* ── STEP: rcdCurrent ──────────────────────────────────────────── */}
          {active === 'rcdCurrent' && (
            <>
              <h3 className="mb-4 text-base font-semibold text-white">Nominale aardlekstroom (IΔn)</h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {([30, 100, 300, 500] as const).map((mA) => (
                  <Opt
                    key={mA}
                    onClick={() => set({ rcdCurrent: mA / 1000 })}
                    active={state.rcdCurrent === mA / 1000}
                    icon={mA <= 30 ? '🔴' : mA <= 100 ? '🟠' : '🟡'}
                    label={`${mA} mA`}
                    sub={mA === 30 ? 'Persoonsbeveil.' : mA === 100 ? 'Brand / gemengd' : mA === 300 ? 'Brand' : 'Selectief'}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── STEP: breaker ─────────────────────────────────────────────── */}
          {active === 'breaker' && (
            <>
              <h3 className="mb-4 text-base font-semibold text-white">Type automaat</h3>
              <div className="mb-4 flex gap-2">
                {(['B', 'C', 'D'] as BreakerType[]).map((t) => (
                  <Chip
                    key={t}
                    onClick={() => setState((p) => ({ ...p, breakerType: t }))}
                    active={state.breakerType === t}
                    label={`Type ${t}${t === 'B' ? ' (×5)' : t === 'C' ? ' (×10)' : ' (×20)'}`}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Stroomwaarde (A)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={state.breakerAmps}
                    onChange={(e) => setState((p) => ({ ...p, breakerAmps: e.target.value }))}
                    placeholder="bijv. 16"
                    className="w-32 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                  />
                  <span className="self-center text-sm text-zinc-500">A</span>
                </div>
                {state.breakerType && state.breakerAmps && (
                  <p className="text-xs text-zinc-500">
                    Ia = {({ B: 5, C: 10, D: 20 }[state.breakerType])} × {state.breakerAmps} ={' '}
                    <strong className="text-orange-400">
                      {({ B: 5, C: 10, D: 20 }[state.breakerType]) * Number(state.breakerAmps)} A
                    </strong>
                  </p>
                )}
              </div>
              <button
                disabled={!state.breakerType || !state.breakerAmps.trim()}
                onClick={() => setEditingStep(null)}
                className="mt-4 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white transition-opacity hover:bg-orange-400 disabled:opacity-30"
              >
                Bevestigen
              </button>
            </>
          )}

          {/* ── STEP: voltageLimit ────────────────────────────────────────── */}
          {active === 'voltageLimit' && (
            <>
              <h3 className="mb-1 text-base font-semibold text-white">Aanraakspanningsgrens (UL)</h3>
              <p className="mb-4 text-xs text-zinc-500">
                Bepaalt de maximaal toelaatbare aanraakspanning bij een fout.
              </p>
              <div className="flex flex-col gap-2.5">
                <Opt
                  onClick={() => set({ voltageLimit: 50 })}
                  active={state.voltageLimit === 50}
                  icon="🏠"
                  label="50 V — droge ruimte"
                  sub="Standaard voor woningen en droge bedrijfsruimten"
                />
                <Opt
                  onClick={() => set({ voltageLimit: 25 })}
                  active={state.voltageLimit === 25}
                  icon="💧"
                  label="25 V — vochtige ruimte / buiten"
                  sub="Badkamers, keukens, buiteninstallaties, zwembaden"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Result */}
      {active === 'result' && result && (
        <ResultCard result={result} onReset={() => setState(EMPTY)} rho={activeRho} />
      )}
    </div>
  );
}
