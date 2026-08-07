'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { OpleverrapportView } from '@/components/meting/OpleverrapportView';
import {
  SANDBOX_CITIES,
  getSandboxCity,
  type SandboxCityId,
} from '@/lib/sandbox/cities';

export function SandboxDemo({ initialCityId }: { initialCityId?: string }) {
  const t = useTranslations('sandbox');
  const [cityId, setCityId] = useState<SandboxCityId>(
    (SANDBOX_CITIES.some(c => c.id === initialCityId)
      ? initialCityId
      : 'amsterdam') as SandboxCityId,
  );
  const city = getSandboxCity(cityId);

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

        <section className="mt-8">
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
                  onClick={() => setCityId(c.id)}
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

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-[#111] px-4 py-4">
            <p className="text-[11px] uppercase tracking-widest text-white/30">{t('statDepth')}</p>
            <p className="mt-1 font-condensed text-2xl font-black text-[#E8761A]">
              {city.calc.result.dimension.toFixed(1)} m
            </p>
            <p className="mt-1 text-[11px] text-white/40">{t('statDepthHint')}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[#111] px-4 py-4">
            <p className="text-[11px] uppercase tracking-widest text-white/30">{t('statRa')}</p>
            <p className="mt-1 font-condensed text-2xl font-black">
              {city.meting.achieved_ra.toFixed(2)} Ω
            </p>
            <p className="mt-1 text-[11px] text-white/40">
              {t('statRaHint', { target: city.calc.input_values.targetResistance })}
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[#111] px-4 py-4">
            <p className="text-[11px] uppercase tracking-widest text-white/30">{t('statSoil')}</p>
            <p className="mt-1 text-sm font-semibold">{city.soilHint}</p>
            <p className="mt-1 text-[11px] text-white/40">{city.province}</p>
          </div>
        </section>

        <p className="mt-4 text-sm text-white/55">{city.valueNote}</p>

        <section className="mt-10">
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
        </section>

        <section className="mt-10 rounded-2xl border border-[#E8761A]/25 bg-gradient-to-b from-[#E8761A]/10 to-transparent p-6">
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
          </div>
          <p className="mt-3 text-[11px] text-white/35">{t('ctaFootnote')}</p>
        </section>
      </div>
    </div>
  );
}
