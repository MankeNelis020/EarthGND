import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PLANS, LOSSE_CREDITS } from '@/lib/plans';
import { formatPriceCompact } from '@/lib/pricing';

function Check() {
  return (
    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const starterPrice = formatPriceCompact(PLANS.starter.prijs, locale);
  const singlePrice  = formatPriceCompact(LOSSE_CREDITS.single.prijs, locale);

  const featuresFree = [t('featuresFree.f1'), t('featuresFree.f2'), t('featuresFree.f3'), t('featuresFree.f4')];
  const featuresPaid = [
    t('featuresPaid.f1'), t('featuresPaid.f2'), t('featuresPaid.f3'),
    t('featuresPaid.f4'), t('featuresPaid.f5'), t('featuresPaid.f6'),
  ];

  return (
    <div className="min-h-screen bg-canvas">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pb-20 pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,118,26,0.12),transparent)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-4 py-1.5 text-xs font-semibold tracking-wider text-[#E8761A]">
            NEN 1010 · NEN 62305 · NEN 50522
          </div>
          <h1 className="font-condensed mb-6 text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-7xl">
            {t('titleLine1')}<br />
            <span className="text-[#E8761A]">{t('titleLine2')}</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/55">{t('subtitle')}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/tool/ohm" className="rounded-xl bg-[#E8761A] px-8 py-3.5 text-sm font-bold text-white hover:bg-[#d06510] transition-colors">
              {t('ctaPrimary')}
            </Link>
            <Link href="/tool/diepte" className="rounded-xl border border-white/15 px-8 py-3.5 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white transition-colors">
              {t('ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Workflow strip ────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-[#0d0d0d] px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-white/25">
            Van berekening tot opleverrapport
          </p>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Bereken',
                desc: 'Voer de postcode in. BRO levert grondsoort, grondwater en pH. Calculator bepaalt de pendiepte.',
              },
              {
                step: '02',
                title: 'Nodig uit',
                desc: 'Stuur de monteur een digitale taakopdracht per e-mail — inclusief verwachte pendiepte en doelweerstand.',
              },
              {
                step: '03',
                title: 'Meet',
                desc: 'Monteur bevestigt de veldmeting op zijn telefoon. EarthGND archiveert het gemeten resultaat.',
              },
              {
                step: '04',
                title: 'Rapporteer',
                desc: 'Genereer en onderteken het NEN 1010 deel 6 opleverrapport. Direct beschikbaar in uw dossier.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col gap-2">
                <span className="font-condensed text-3xl font-black text-[#E8761A]/30">{step}</span>
                <p className="font-condensed text-base font-bold text-white">{title}</p>
                <p className="text-xs leading-relaxed text-white/40">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Calculator cards ─────────────────────────────────────────────── */}
      <section className="px-4 pb-24 pt-16">
        <div className="mx-auto max-w-5xl grid gap-4 md:grid-cols-2">

          {/* Free card */}
          <div className="flex flex-col rounded-2xl border border-white/8 bg-[#111] p-7">
            <div className="mb-5">
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400">
                {t('card1Label')}
              </span>
            </div>
            <h2 className="font-condensed mb-2 text-2xl font-black text-white">{t('card1Title')}</h2>
            <p className="mb-6 text-sm leading-relaxed text-white/55">{t('card1Desc')}</p>
            <ul className="mb-8 flex flex-col gap-2">
              {featuresFree.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/60"><Check />{f}</li>
              ))}
            </ul>
            <div className="mt-auto">
              <Link href="/tool/ohm" className="block w-full rounded-xl border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-[#E8761A]/50 hover:text-[#E8761A] transition-colors">
                {t('card1Cta')}
              </Link>
            </div>
          </div>

          {/* Paid card */}
          <div className="flex flex-col rounded-2xl border border-[#E8761A]/25 bg-gradient-to-b from-[#E8761A]/8 to-[#111] p-7">
            <div className="mb-5 flex items-center justify-between">
              <span className="rounded-full border border-[#E8761A]/30 bg-[#E8761A]/10 px-2.5 py-1 text-xs font-semibold text-[#E8761A]">
                {t('card2Label', { price: starterPrice })}
              </span>
              <span className="text-xs text-white/30">{t('card2PriceNote', { price: singlePrice })}</span>
            </div>
            <h2 className="font-condensed mb-2 text-2xl font-black text-white">{t('card2Title')}</h2>
            <p className="mb-6 text-sm leading-relaxed text-white/55">{t('card2Desc')}</p>
            <ul className="mb-8 flex flex-col gap-2">
              {featuresPaid.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/60"><Check />{f}</li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-2">
              <Link href="/pricing" className="block w-full rounded-xl bg-[#E8761A] py-3 text-center text-sm font-bold text-white hover:bg-[#d06510] transition-colors">
                {t('card2Cta')}
              </Link>
              <Link href="/examples/pendiepte" className="block w-full rounded-xl py-2 text-center text-xs text-white/35 hover:text-white/60 transition-colors">
                Zie een voorbeeldberekening →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pillars ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 px-4 py-16">
        <div className="mx-auto max-w-5xl grid gap-px grid-cols-1 overflow-hidden rounded-2xl border border-white/8 sm:grid-cols-3">
          {[
            { title: t('pillar1Title'), desc: t('pillar1Desc') },
            { title: t('pillar2Title'), desc: t('pillar2Desc') },
            { title: t('pillar3Title'), desc: t('pillar3Desc') },
          ].map((item) => (
            <div key={item.title} className="bg-[#111] px-7 py-8">
              <p className="font-condensed mb-2 text-lg font-bold text-white">{item.title}</p>
              <p className="text-sm leading-relaxed text-white/45">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-[#111] px-7 py-8">
              <p className="font-condensed mb-1 text-xl font-black text-white">Begin gratis</p>
              <p className="mb-5 text-sm text-white/40">Weerstand Calculator — geen account nodig</p>
              <Link href="/tool/ohm" className="inline-flex rounded-xl border border-white/15 px-6 py-2.5 text-sm font-semibold text-white hover:border-[#E8761A]/50 hover:text-[#E8761A] transition-colors">
                Open calculator
              </Link>
            </div>
            <div className="rounded-2xl border border-[#E8761A]/20 bg-gradient-to-br from-[#E8761A]/6 to-transparent px-7 py-8">
              <p className="font-condensed mb-1 text-xl font-black text-white">Pendiepte berekenen</p>
              <p className="mb-5 text-sm text-white/40">
                Vanaf {singlePrice} per berekening · of {starterPrice}/mnd onbeperkt
              </p>
              <Link href="/pricing" className="inline-flex rounded-xl bg-[#E8761A] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#d06510] transition-colors">
                Bekijk tarieven
              </Link>
            </div>
          </div>

          {/* Trust row */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-white/20">
            <span>AVG-compliant</span>
            <span className="h-3 w-px bg-white/10" />
            <span>EU-opslag</span>
            <span className="h-3 w-px bg-white/10" />
            <span>Automatische factuur</span>
            <span className="h-3 w-px bg-white/10" />
            <span>Per maand opzegbaar</span>
          </div>
        </div>
      </section>

    </div>
  );
}
