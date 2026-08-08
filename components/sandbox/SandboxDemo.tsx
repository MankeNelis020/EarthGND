'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { OpleverrapportView } from '@/components/meting/OpleverrapportView';
import { HeroMetric, ScenarioMetric, InstrumentPanel } from '@/components/ui/instrument';
import {
  SANDBOX_CITIES,
  getSandboxCity,
  type SandboxCityFixture,
  type SandboxCityId,
} from '@/lib/sandbox/cities';

type Step = 'calc' | 'meting' | 'rapport';

const STEPS: Step[] = ['calc', 'meting', 'rapport'];

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
  labels,
}: {
  step: Step;
  labels: Record<Step, string>;
}) {
  const idx = STEPS.indexOf(step);
  return (
    <ol className="mt-6 flex flex-wrap gap-2">
      {STEPS.map((s, i) => {
        const active = s === step;
        const done = i < idx;
        return (
          <li
            key={s}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              active
                ? 'border-[#E8761A]/40 bg-[#E8761A]/10 text-[#E8761A]'
                : done
                  ? 'border-white/15 text-white/70'
                  : 'border-white/8 text-white/30'
            }`}
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            {labels[s]}
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
      {/* Location panel — mirrors PostcodeInput result look */}
      <InstrumentPanel>
        <p className="type-label mb-3">{t('calcLocationLabel')}</p>
        <p className="text-sm font-semibold text-white">
          {[city.meting.straatnaam, city.meting.huisnummer].filter(Boolean).join(' ')}
          {', '}
          {city.meting.postcode} {city.meting.woonplaats}
        </p>
        <p className="mt-1 text-xs text-white/45">
          {city.soilHint} · ρ ≈ {city.calc.input_values.rho} Ω·m · GHG {gw} m
        </p>
        <p className="mt-2 text-[11px] text-amber-200/70">{t('calcLocationDummy')}</p>
      </InstrumentPanel>

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
            <span className="text-white/40">{t('calcElectrode')}: </span>
            Verticale pen · {city.calc.input_values.drijfmethode}
          </p>
          <p>
            <span className="text-white/40">{t('calcTarget')}: </span>
            ≤ {target} Ω
          </p>
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

      {/* Depth curve preview — same visual language as rapport */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <div className="border-b border-white/8 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            {t('calcCurveTitle')}
          </p>
          <p className="mt-1 text-[11px] text-white/35">{t('calcCurveHint')}</p>
        </div>
        <div className="divide-y divide-white/5">
          {(() => {
            const maxRa = Math.max(...city.meting.depth_curve.map(pt => pt.ra), 1);
            return city.meting.depth_curve.map((pt, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-16 text-sm text-white/60">{pt.depth} m</span>
                <div className="h-1.5 flex-1 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[#E8761A]/60"
                    style={{ width: `${Math.min((pt.ra / maxRa) * 100, 100)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-semibold text-white">{pt.ra} Ω</span>
              </div>
            ));
          })()}
        </div>
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

function DemoMetingStep({
  city,
  onBack,
  onNext,
}: {
  city: SandboxCityFixture;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('sandbox');
  const m = city.meting;
  const expected = city.calc.result.dimension;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="rounded-xl border border-[#E8761A]/25 bg-[#E8761A]/5 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
          {t('metingExpectedLabel')}
        </p>
        <p className="mt-1 text-sm text-white/80">
          {t('metingExpectedBody', {
            depth: expected.toFixed(2),
            target: city.calc.input_values.targetResistance,
            method: city.calc.input_values.drijfmethode,
          })}
        </p>
      </div>

      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {t('metingLocation')}
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-white/40">GPS: </span>
            {m.lat.toFixed(5)}, {m.lon.toFixed(5)} ± {m.gps_accuracy_m} m
          </p>
          <p>
            <span className="text-white/40">Adres: </span>
            {[m.straatnaam, m.huisnummer, m.postcode, m.woonplaats].filter(Boolean).join(' ')}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {t('metingElectrode')}
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-white/40">Type: </span>
            Verticale pen
          </p>
          <p>
            <span className="text-white/40">Drijfmethode: </span>
            {m.drijfmethode}
          </p>
          <p>
            <span className="text-white/40">Aantal pennen: </span>
            {m.aantal_pennen}
          </p>
        </div>
      </section>

      {(m.rods?.length ?? 0) > 1 ? (
        <section className="overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
          <div className="border-b border-white/8 px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
              {t('metingRods', { n: m.rods!.length })}
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {m.rods!.map(rod => (
              <div key={rod.rod_number} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                <span className="w-14 text-white/55">Pen {rod.rod_number}</span>
                <span className="w-20 tabular-nums">{rod.installed_depth.toFixed(2)} m</span>
                <span className="font-semibold text-[#E8761A] tabular-nums">
                  {rod.achieved_ra.toFixed(2)} Ω
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/8 px-5 py-3 text-sm">
            <span className="text-white/40">{t('metingCombinedRa')}: </span>
            <span className="font-semibold text-green-400">{m.achieved_ra.toFixed(2)} Ω</span>
            <span className="ml-2 text-[11px] text-green-400/80">✓ {t('metingPass')}</span>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            {t('metingFinal')}
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-white/40">Diepte: </span>
              {m.installed_depth.toFixed(2)} m
            </p>
            <p>
              <span className="text-white/40">Ra: </span>
              <span className="font-semibold text-green-400">{m.achieved_ra.toFixed(2)} Ω</span>
              <span className="ml-2 text-[11px] text-green-400/80">✓ {t('metingPass')}</span>
            </p>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
        <div className="border-b border-white/8 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            {t('metingCurve')}
          </p>
        </div>
        <div className="divide-y divide-white/5">
          {(() => {
            const maxRa = Math.max(...m.depth_curve.map(pt => pt.ra), 1);
            return m.depth_curve.map((pt, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-2.5">
                <span className="w-16 text-sm text-white/60">{pt.depth} m</span>
                <div className="h-1.5 flex-1 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[#E8761A]/60"
                    style={{ width: `${Math.min((pt.ra / maxRa) * 100, 100)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-semibold">{pt.ra} Ω</span>
              </div>
            ));
          })()}
        </div>
      </section>

      {m.notes && (
        <section className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            {t('metingNotes')}
          </p>
          <p className="text-sm leading-relaxed text-white/70">{m.notes}</p>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
        >
          {t('ctaBackCalc')}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510]"
        >
          {t('ctaToRapport')}
        </button>
      </div>
    </div>
  );
}

function DemoRapportStep({
  city,
  onBack,
}: {
  city: SandboxCityFixture;
  onBack: () => void;
}) {
  const t = useTranslations('sandbox');

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-condensed text-xl font-bold">{t('previewTitle')}</h2>
          <p className="mt-1 text-xs text-white/40">{t('previewSubtitle')}</p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
          {t('dummyBadge')}
        </span>
      </div>

      <div className="rounded-2xl border border-dashed border-amber-500/25 bg-[#0d0d0d] p-4 sm:p-6">
        <OpleverrapportView
          uuid={city.calc.id}
          calc={city.calc}
          meting={city.meting}
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

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
  const city = getSandboxCity(cityId);

  function selectCity(id: SandboxCityId) {
    setCityId(id);
    setStep('calc');
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

        <Stepper step={step} labels={stepLabels} />

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

        {step === 'calc' && (
          <DemoCalcResults city={city} onNext={() => setStep('meting')} />
        )}
        {step === 'meting' && (
          <DemoMetingStep
            city={city}
            onBack={() => setStep('calc')}
            onNext={() => setStep('rapport')}
          />
        )}
        {step === 'rapport' && (
          <DemoRapportStep city={city} onBack={() => setStep('meting')} />
        )}
      </div>
    </div>
  );
}
