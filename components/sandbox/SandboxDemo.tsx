'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { OpleverrapportView } from '@/components/meting/OpleverrapportView';
import { RodCurveChart } from '@/components/tools/RodCurveChart';
import { HeroMetric, ScenarioMetric, InstrumentPanel } from '@/components/ui/instrument';
import { DRIVE_METHOD_LABELS, type DriveMethod } from '@/lib/pipeline/driveability';
import {
  SANDBOX_CITIES,
  getSandboxCity,
  type SandboxCityFixture,
  type SandboxCityId,
} from '@/lib/sandbox/cities';

type Step = 'calc' | 'meting' | 'rapport';

const STEPS: Step[] = ['calc', 'meting', 'rapport'];

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white read-only:cursor-default read-only:opacity-90 focus:border-[#E8761A] focus:outline-none';

function driveLabel(raw: string, uiFallback: string): string {
  return DRIVE_METHOD_LABELS[raw as DriveMethod] ?? uiFallback ?? raw;
}

function scenariosFromCity(city: SandboxCityFixture) {
  const d = city.calc.result.dimension;
  const gw = city.calc.input_values.groundwaterDepth;
  const ra = city.calc.result.achievedResistance;
  return [
    {
      key: 'gunstig',
      label: 'Gunstig',
      sublabel: `GWT ${(gw - 0.4).toFixed(1)}m — natte periode`,
      depth: Math.max(1.5, d * 0.82),
      ra: ra * 0.9,
      highlight: false,
      dimmed: false,
    },
    {
      key: 'gemiddeld',
      label: 'Gemiddeld',
      sublabel: `GWT ${gw.toFixed(1)}m — gemiddeld`,
      depth: d,
      ra,
      highlight: true,
      dimmed: false,
    },
    {
      key: 'ongunstig',
      label: 'Ongunstig',
      sublabel: `GWT ${(gw + 1.2).toFixed(1)}m — droge zomer`,
      depth: d * 1.22,
      ra: ra * 1.15,
      highlight: false,
      dimmed: true,
    },
  ] as const;
}

function Stepper({
  step,
  maxReached,
  labels,
  onSelect,
}: {
  step: Step;
  maxReached: number;
  labels: Record<Step, string>;
  onSelect: (s: Step) => void;
}) {
  return (
    <ol className="mt-6 flex flex-wrap gap-2">
      {STEPS.map((s, i) => {
        const active = s === step;
        const reachable = i <= maxReached;
        return (
          <li key={s}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(s)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-[#E8761A]/40 bg-[#E8761A]/10 text-[#E8761A]'
                  : reachable
                    ? 'border-white/15 text-white/70 hover:border-white/30 hover:text-white'
                    : 'cursor-not-allowed border-white/8 text-white/30'
              }`}
            >
              <span className="tabular-nums opacity-70">{i + 1}</span>
              {labels[s]}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function DemoCalcResults({
  city,
  onNext,
}: {
  city: SandboxCityFixture;
  onNext: () => void;
}) {
  const t = useTranslations('sandbox');
  const scenarios = scenariosFromCity(city);
  const target = city.calc.input_values.targetResistance;
  const gw = city.calc.input_values.groundwaterDepth;
  const dim = city.calc.result.dimension;
  const rods = city.meting.aantal_pennen;

  return (
    <div className="mt-8 flex flex-col gap-section">
      <InstrumentPanel>
        <p className="type-label mb-3">{t('calcLocationLabel')}</p>
        <p className="text-sm font-semibold text-white">
          {[city.meting.straatnaam, city.meting.huisnummer].filter(Boolean).join(' ')}
          {', '}
          {city.meting.postcode} {city.meting.woonplaats}
        </p>
        <p className="mt-1 text-xs text-white/45">
          {city.soilHint} · ρ ≈ {city.soil.effectiveRho} Ω·m · GHG {gw} m
        </p>
        <p className="mt-2 text-[11px] text-amber-200/70">{t('calcLocationDummy')}</p>
      </InstrumentPanel>

      {/* BRO-like soil samples — mirrors PostcodeInput table */}
      <div className="panel overflow-hidden">
        <div className="border-b border-white/6 px-5 py-3">
          <p className="text-xs font-medium text-white/50">{t('calcSoilTable')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-white/35">
              <tr>
                <th className="px-5 py-2">Diepte</th>
                <th className="px-5 py-2">Klasse</th>
                <th className="px-5 py-2">ρ (Ω·m)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {city.soil.samples.map(s => (
                <tr key={s.depthM}>
                  <td className="px-5 py-2 tabular-nums text-white/70">−{s.depthM} m</td>
                  <td className="px-5 py-2 capitalize text-white/80">{s.classLabel}</td>
                  <td className="px-5 py-2 tabular-nums">{s.rho}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`border-t px-5 py-3 text-sm ${
          city.soil.riskClass === 'I' ? 'border-green-500/20 bg-green-500/5 text-green-300' :
          city.soil.riskClass === 'II' ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-200' :
          'border-orange-500/20 bg-orange-500/5 text-orange-200'
        }`}>
          <p className="font-semibold">{city.soil.riskLabel}</p>
          <p className="mt-0.5 text-xs opacity-80">{city.soil.riskDescription}</p>
        </div>
      </div>

      {/* Read-only params — same labels as calculator */}
      <div className="panel p-5">
        <p className="mb-3 text-xs font-medium text-white/50">{t('calcParamsLabel')}</p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-white/40">{t('calcElectrode')}: </span>
            Verticale pen
          </p>
          <p>
            <span className="text-white/40">Drijfmethode: </span>
            {city.soil.driveMethodUi}
          </p>
          <p>
            <span className="text-white/40">Diameter: </span>
            {city.soil.diameterLabel}
          </p>
          <p>
            <span className="text-white/40">{t('calcTarget')}: </span>
            {city.soil.targetCategoryLabel}
          </p>
          <p>
            <span className="text-white/40">ρ effectief: </span>
            {city.soil.effectiveRho} Ω·m
          </p>
          <p>
            <span className="text-white/40">GHG: </span>
            {gw} m
          </p>
        </div>
      </div>

      <HeroMetric
        label={t('calcHeroLabel')}
        value={dim.toFixed(2)}
        unit="m diep"
        context={`doel ≤ ${target} Ω · GHG ${gw} m`}
        pulseKey={`${city.id}-${dim}`}
      />

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-3">
          <p className="text-xs font-medium text-white/50">{t('calcConfigLabel')}</p>
          <p className="text-xs font-bold text-white">
            {rods > 1
              ? `${rods} pennen × ${dim.toFixed(1)} m`
              : `1 pen — ${dim.toFixed(2)} m diep`}
          </p>
        </div>
        <div className="space-y-2 px-5 py-4 text-sm text-white/70">
          <p>
            <span className="text-white/40">{t('calcPredictedRa')}: </span>
            {city.calc.result.achievedResistance.toFixed(2)} Ω
          </p>
          <p className="text-xs text-white/45">{city.valueNote}</p>
        </div>
      </div>

      <div className="surface-panel p-gutter">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="type-label text-brand">{t('calcScenarios')}</span>
          <span className="text-xs text-white/50">
            GHG {gw}m · doel ≤ {target} Ω
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {scenarios.map(s => (
            <ScenarioMetric
              key={s.key}
              label={s.label}
              sublabel={s.sublabel}
              value={s.depth.toFixed(2)}
              unit="m"
              secondary={`Ra ≈ ${s.ra.toFixed(2)} Ω`}
              highlight={s.highlight}
              dimmed={s.dimmed}
            />
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <p className="mb-1 text-xs font-medium text-white/50">{t('calcCurveTitle')}</p>
        <p className="mb-3 text-[11px] text-white/35">{t('calcCurveHint')}</p>
        <RodCurveChart
          key={city.id}
          targetResistance={target}
          rhoDry={city.soil.rhoDry}
          rhoWet={city.soil.rhoWet}
          gwGunstig={Math.max(0.3, gw - 0.4)}
          gwGemiddeld={gw}
          gwOngunstig={gw + 1.2}
          computedDepth={dim}
        />
      </div>

      <div className="rounded-2xl border border-[#E8761A]/25 bg-[#E8761A]/5 p-5">
        <p className="text-sm font-semibold text-[#E8761A]">{t('calcNextTitle')}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">{t('calcNextBody')}</p>
        <button
          type="button"
          onClick={onNext}
          className="mt-4 rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510]"
        >
          {t('ctaToMeting')}
        </button>
      </div>
    </div>
  );
}

type DepthPoint = { depth: number; ra: number };

type MetingOverrides = {
  depth_curve: DepthPoint[];
  installed_depth: number;
  achieved_ra: number;
};

/** Prefills like MonteurForm — depth curve editable in 3 m steps (pin 1,5 m × 2). */
function DemoMetingStep({
  city,
  onBack,
  onNext,
}: {
  city: SandboxCityFixture;
  onBack: () => void;
  onNext: (overrides: MetingOverrides) => void;
}) {
  const t = useTranslations('sandbox');
  const m = city.meting;
  const expected = city.calc.result.dimension;
  const target = city.calc.input_values.targetResistance;
  const methodLabel = driveLabel(m.drijfmethode, city.soil.driveMethodUi);
  const isMulti = (m.rods?.length ?? 0) > 1;

  const [depthCurve, setDepthCurve] = useState<DepthPoint[]>(() =>
    m.depth_curve.map(p => ({ ...p })),
  );

  useEffect(() => {
    setDepthCurve(city.meting.depth_curve.map(p => ({ ...p })));
  }, [city.id, city.meting.depth_curve]);

  function addRow() {
    const lastDepth = depthCurve[depthCurve.length - 1]?.depth ?? 0;
    setDepthCurve(prev => [...prev, { depth: lastDepth + 3, ra: 0 }]);
  }
  function removeRow(i: number) {
    if (depthCurve.length <= 1) return;
    setDepthCurve(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateRa(i: number, ra: number) {
    setDepthCurve(prev => prev.map((r, idx) => (idx === i ? { ...r, ra } : r)));
  }

  const lastPoint = depthCurve[depthCurve.length - 1];
  const installedDepth = isMulti ? m.installed_depth : (lastPoint?.depth ?? m.installed_depth);
  const achievedRa = isMulti
    ? m.achieved_ra
    : (lastPoint && lastPoint.ra > 0 ? lastPoint.ra : m.achieved_ra);
  const maxRa = Math.max(...depthCurve.map(p => p.ra), 1);
  const meetsTarget = achievedRa <= target;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
          {t('metingPageEyebrow')}
        </p>
        <h2 className="font-condensed mt-1 text-2xl font-black">{t('metingPageTitle')}</h2>
        <p className="mt-1 text-sm text-white/45">{t('metingPageSubtitle')}</p>
      </div>

      <div className="rounded-xl border border-[#E8761A]/25 bg-[#E8761A]/5 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
          {t('metingExpectedLabel')}
        </p>
        <p className="mt-1 text-sm text-white/80">
          {t('metingExpectedBody', {
            depth: expected.toFixed(2),
            target,
            method: methodLabel,
          })}
        </p>
      </div>

      {/* GPS — filled state like MonteurForm after locate */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          {t('metingGps')} <span className="text-red-400">*</span>
        </p>
        <div className="mb-3 rounded-lg border border-green-500/25 bg-green-500/5 px-3 py-2">
          <p className="text-xs font-semibold text-green-400">{t('metingGpsOk')}</p>
          <p className="mt-0.5 text-xs text-white/60">
            {m.lat.toFixed(6)}, {m.lon.toFixed(6)}
            <span className="ml-2 text-white/40">± {m.gps_accuracy_m} m</span>
          </p>
        </div>
        <button
          type="button"
          disabled
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/40"
        >
          {t('metingGpsBtn')}
        </button>
      </div>

      {/* Address fields — same grid as MonteurForm */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          {t('metingAddress')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-white/70">Postcode</label>
            <input readOnly value={m.postcode} className={inputClass} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs text-white/70">Woonplaats</label>
            <input readOnly value={m.woonplaats} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Straatnaam</label>
            <input readOnly value={m.straatnaam} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Huisnummer</label>
            <input readOnly value={m.huisnummer} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Electrode + drive method */}
      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          {t('metingElectrode')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[#E8761A] bg-[#E8761A]/10 py-2.5 text-center text-sm font-semibold text-[#E8761A]">
            Verticale pen / staaf
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 py-2.5 text-center text-sm font-semibold text-white/35">
            Horizontaal lint
          </div>
        </div>
        <p className="mb-1.5 mt-4 text-xs text-white/70">{t('metingDrive')}</p>
        <div className="rounded-lg border border-[#E8761A] bg-[#E8761A]/10 px-3 py-2 text-xs text-[#E8761A]">
          {methodLabel}
        </div>
      </div>

      {isMulti ? (
        <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
            {t('metingRods', { n: m.rods!.length })}
          </p>
          <p className="mt-0.5 text-[10px] text-white/40">{t('metingRodsHint')}</p>
          <div className="mt-4 flex flex-col gap-3">
            {m.rods!.map(rod => (
              <div key={rod.rod_number} className="rounded-xl border border-white/8 bg-white/3 p-4">
                <p className="mb-3 text-xs font-semibold text-white/70">Pen {rod.rod_number}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] text-white/50">Geïnstalleerde diepte (m)</label>
                    <input readOnly value={rod.installed_depth.toFixed(1)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-white/50">Gemeten Ra (Ω)</label>
                    <input readOnly value={rod.achieved_ra.toFixed(2)} className={inputClass} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-[#E8761A]/20 bg-[#E8761A]/5 p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
              {t('metingCombinedRa')}
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={m.achieved_ra.toFixed(2)} className="w-32 rounded-lg border border-[#E8761A]/30 bg-white/5 px-3 py-2 text-sm text-white" />
              <span className="text-sm text-white/60">Ω</span>
              <span className="text-[11px] text-green-400">✓ {t('metingPass')} (≤ {target} Ω)</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
              {t('metingDiameterStop')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-white/70">Geslagen diameter</label>
                <input readOnly value={city.soil.diameterLabel} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/70">Stopreden</label>
                <input readOnly value={t('metingStopredenDemo')} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
              {t('metingCurve')}
            </p>
            <p className="mb-1 text-[10px] text-white/40">{t('metingCurveHint')}</p>
            <p className="mb-4 text-[10px] text-white/35">{t('metingCurveRule')}</p>
            <div className="flex flex-col gap-2">
              {depthCurve.map((row, i) => (
                <div key={`${row.depth}-${i}`} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={row.depth}
                      className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm tabular-nums text-white"
                      title={t('metingDepthLocked')}
                    />
                    <span className="text-xs text-white/40">m</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-[#E8761A]/50"
                      style={{ width: `${Math.min((row.ra / maxRa) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={row.ra || ''}
                      onChange={e => updateRa(i, Number(e.target.value))}
                      placeholder="Ra"
                      className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#E8761A] focus:outline-none"
                    />
                    <span className="text-xs text-white/40">Ω</span>
                  </div>
                  {depthCurve.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-white/30 hover:text-red-400"
                      aria-label={t('metingRemoveRow')}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-3 flex items-center gap-1.5 text-xs text-[#E8761A] hover:text-[#d06510]"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              {t('metingAddPoint')} (+3 m)
            </button>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
              {t('metingFinal')} <span className="text-red-400">*</span>
            </p>
            <p className="mb-3 text-[10px] text-white/40">{t('metingFinalHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-white/70">Geïnstalleerde diepte (m)</label>
                <input readOnly value={installedDepth.toFixed(0)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/70">Gemeten Ra (Ω)</label>
                <div className="flex items-center gap-2">
                  <input readOnly value={achievedRa.toFixed(2)} className={inputClass} />
                  {meetsTarget ? (
                    <span className="shrink-0 text-[11px] text-green-400">✓ {t('metingPass')}</span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-amber-300">{t('metingKeepGoing')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          {t('metingNotes')}
        </p>
        <textarea
          readOnly
          value={m.notes}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="rounded-2xl border border-[#E8761A]/25 bg-[#E8761A]/5 p-5">
        <p className="text-sm font-semibold text-[#E8761A]">{t('metingSubmitTitle')}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">{t('metingSubmitBody')}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
          >
            {t('ctaBackCalc')}
          </button>
          <button
            type="button"
            onClick={() =>
              onNext({
                depth_curve: depthCurve,
                installed_depth: installedDepth,
                achieved_ra: achievedRa,
              })
            }
            className="rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510]"
          >
            {t('ctaConfirmMeting')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoRapportStep({
  city,
  metingOverrides,
  onBack,
}: {
  city: SandboxCityFixture;
  metingOverrides: MetingOverrides | null;
  onBack: () => void;
}) {
  const t = useTranslations('sandbox');
  const meting = {
    ...city.meting,
    ...(metingOverrides ?? {}),
  };

  return (
    <div className="mt-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
          {t('rapportEyebrow')}
        </p>
        <h2 className="font-condensed mt-1 text-2xl font-black">{t('previewTitle')}</h2>
        <p className="mt-1 text-sm text-white/45">{t('previewSubtitle')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            {t('dummyBadge')}
          </span>
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-400">
            {t('rapportConfirmed')}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-amber-500/25 bg-[#0d0d0d] p-4 sm:p-6">
        <OpleverrapportView
          uuid={city.calc.id}
          calc={city.calc}
          meting={meting}
          isCalculator={false}
          readOnly
          profile={{
            company_name: 'Demo Installatie B.V.',
            logo_url: null,
            installateur_naam: 'Demo monteur',
            installateur_erkenning: 'DEMO — geen echte erkenning',
          }}
        />
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
        >
          {t('ctaBackMeting')}
        </button>
      </div>

      <section className="mt-8 rounded-2xl border border-[#E8761A]/25 bg-gradient-to-b from-[#E8761A]/10 to-transparent p-6">
        <h2 className="font-condensed text-xl font-bold">{t('ctaTitle')}</h2>
        <p className="mt-2 text-sm text-white/55">{t('ctaBody')}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className="rounded-xl bg-[#E8761A] px-6 py-3 text-center text-sm font-bold text-white hover:bg-[#d06510]"
          >
            {t('ctaPricing')}
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-white/15 px-6 py-3 text-center text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
          >
            {t('ctaLogin')}
          </Link>
          <Link
            href="/tool/diepte"
            className="rounded-xl border border-white/15 px-6 py-3 text-center text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
          >
            {t('ctaRealCalc')}
          </Link>
        </div>
        <p className="mt-3 text-[11px] text-white/35">{t('ctaFootnote')}</p>
      </section>
    </div>
  );
}

export function SandboxDemo({ initialCityId }: { initialCityId?: string }) {
  const t = useTranslations('sandbox');
  const [cityId, setCityId] = useState<SandboxCityId>(
    (SANDBOX_CITIES.some(c => c.id === initialCityId)
      ? initialCityId
      : 'amsterdam') as SandboxCityId,
  );
  const [step, setStep] = useState<Step>('calc');
  const [maxStep, setMaxStep] = useState(0);
  const [metingOverrides, setMetingOverrides] = useState<MetingOverrides | null>(null);
  const city = getSandboxCity(cityId);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, cityId]);

  function goTo(next: Step) {
    const i = STEPS.indexOf(next);
    setStep(next);
    setMaxStep(m => Math.max(m, i));
  }

  function selectCity(id: SandboxCityId) {
    setCityId(id);
    setStep('calc');
    setMaxStep(0);
    setMetingOverrides(null);
  }

  const stepLabels: Record<Step, string> = {
    calc: t('stepCalc'),
    meting: t('stepMeting'),
    rapport: t('stepRapport'),
  };

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
          {t('eyebrow')}
        </p>
        <h1 className="font-condensed mt-1 text-3xl font-black sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          {t('subtitle')}
        </p>

        <div
          role="status"
          className="mt-5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <p className="font-semibold text-amber-200">{t('dummyBannerTitle')}</p>
          <p className="mt-1 text-amber-100/80">{t('dummyBannerBody')}</p>
        </div>

        <Stepper
          step={step}
          maxReached={Math.max(maxStep, STEPS.indexOf(step))}
          labels={stepLabels}
          onSelect={setStep}
        />

        {step === 'calc' && (
          <section className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">
              {t('cityPickerLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {SANDBOX_CITIES.map(c => {
                const active = c.id === cityId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCity(c.id)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-[#E8761A] text-white'
                        : 'border border-white/15 text-white/70 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step !== 'calc' && (
          <p className="mt-6 text-xs text-white/40">
            {t('activeCity')}: <span className="font-semibold text-white/70">{city.name}</span>
            {' · '}
            <button
              type="button"
              onClick={() => goTo('calc')}
              className="text-[#E8761A] hover:underline"
            >
              {t('changeCity')}
            </button>
          </p>
        )}

        {step === 'calc' && (
          <DemoCalcResults city={city} onNext={() => goTo('meting')} />
        )}
        {step === 'meting' && (
          <DemoMetingStep
            city={city}
            onBack={() => goTo('calc')}
            onNext={(overrides) => {
              setMetingOverrides(overrides);
              goTo('rapport');
            }}
          />
        )}
        {step === 'rapport' && (
          <DemoRapportStep
            city={city}
            metingOverrides={metingOverrides}
            onBack={() => goTo('meting')}
          />
        )}
      </div>
    </div>
  );
}
