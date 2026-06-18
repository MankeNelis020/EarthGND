import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'faq' });
  return {
    title: `${t('title')} — EarthGND`,
    description: t('subtitle'),
  };
}

const FAQ_COUNT = 8;

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'faq' });

  const items = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`q${i + 1}` as Parameters<typeof t>[0]),
    a: t(`a${i + 1}` as Parameters<typeof t>[0]),
  }));

  // FAQPage JSON-LD structured data — parsed by Google, ChatGPT, Perplexity, etc.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-10">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">EarthGND</p>
          <h1 className="font-condensed text-4xl font-black text-white">{t('title')}</h1>
          <p className="mt-3 text-sm text-white/50">{t('subtitle')}</p>
        </div>

        <div className="flex flex-col gap-3">
          {items.map(({ q, a }, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-white/8 bg-[#111] open:border-[#E8761A]/30"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-4 px-6 py-5 text-sm font-semibold text-white marker:content-none">
                <span>{q}</span>
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-white/30 transition-transform group-open:rotate-45"
                  viewBox="0 0 24 24" fill="currentColor"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </summary>
              <p className="px-6 pb-6 text-sm leading-relaxed text-white/60">{a}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-[#E8761A]/20 bg-[#E8761A]/5 p-6 text-center">
          <p className="mb-4 text-sm font-semibold text-white">Zelf berekenen?</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/tool/ohm"
              className="rounded-xl bg-[#E8761A] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
            >
              Weerstand Calculator
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/15 px-6 py-2.5 text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              Pendiepte Calculator
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
