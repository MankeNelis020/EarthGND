'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { PLANS, LOSSE_CREDITS } from '@/lib/plans';
import { createClient } from '@/utils/supabase/client';

export const dynamic = 'force-dynamic';

function Check({ muted }: { muted?: boolean }) {
  return (
    <svg className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${muted ? 'text-white/30' : 'text-[#E8761A]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const PLAN_FEATURES: Record<string, string[]> = {
  gratis: [
    'Weerstand Calculator onbeperkt',
    'NEN 1010 normen',
    'Vier outputlagen',
    'Geen account nodig',
  ],
  starter: [
    'Alles van Gratis',
    'Pendiepte per postcode',
    'BRO bodemdata',
    'Risicoklasse I – IV',
    'PDF rapport',
  ],
  basic: [
    'Alles van Starter',
    'Geschiedenis laatste 30 berekeningen',
    'Rapport per mail',
    'Drie berekeningsscenario\'s',
  ],
  pro: [
    'Alles van Basic',
    'API toegang',
    'Bulk import CSV postcodes',
    'Prioriteit support',
  ],
};

export default function PricingPage() {
  const router = useRouter();
  const locale = useLocale();
  const [loading, setLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const stripeReady = true;

  async function handleCheckout(planKey: string, mode: 'subscription' | 'payment') {
    setLoading(planKey);
    setCheckoutError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, mode, locale }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        const errMsg = data.error ?? 'Onbekend fout';
        if (errMsg.includes('niet geconfigureerd') || errMsg.includes('price_')) {
          setCheckoutError('Betalen is nog niet beschikbaar. Mail info@earthgnd.com of probeer het later opnieuw.');
        } else {
          setCheckoutError(errMsg);
        }
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      {checkoutError && (
        <div className="border-b border-red-500/20 bg-red-500/8 px-4 py-3 text-center">
          <p className="text-sm text-red-400">{checkoutError}</p>
        </div>
      )}
      <div className="mx-auto max-w-6xl px-4 py-20">

        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="font-condensed mb-3 text-4xl font-black text-white sm:text-5xl">
            Kies uw plan
          </h1>
          <p className="text-white/50">
            Transparante prijzen. Geen verborgen kosten. Per maand opzegbaar.
          </p>
        </div>

        {/* Plan cards */}
        <div className="mb-16 grid gap-3 md:grid-cols-4">
          {(['gratis', 'starter', 'basic', 'pro'] as const).map((key) => {
            const plan = PLANS[key];
            const features = PLAN_FEATURES[key] ?? [];
            const isBasic = key === 'basic';
            const isFree = key === 'gratis';

            return (
              <div
                key={key}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  isBasic
                    ? 'border-[#E8761A]/40 bg-gradient-to-b from-[#E8761A]/8 to-[#111]'
                    : 'border-white/8 bg-[#111]'
                }`}
              >
                {isBasic && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[#E8761A] px-3 py-1 text-xs font-bold text-white">
                      Meest gekozen
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <p className="font-condensed mb-1 text-lg font-bold text-white">{plan.label}</p>
                  <div className="flex items-baseline gap-1">
                    {plan.prijs === 0 ? (
                      <span className="font-condensed text-3xl font-black text-[#E8761A]">Gratis</span>
                    ) : (
                      <>
                        <span className="font-condensed text-3xl font-black text-[#E8761A]">€{plan.prijs}</span>
                        <span className="text-sm text-white/35">/mnd</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    {plan.credits === 0 ? 'Onbeperkt Weerstand Calculator' : `${plan.credits} berekeningen/mnd`}
                  </p>
                </div>

                <ul className="mb-8 flex flex-col gap-2">
                  {features.map((f, i) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                      <Check muted={i === 0 && key !== 'gratis'} />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  {isFree ? (
                    <a
                      href="/tool/ohm"
                      className="block w-full rounded-xl border border-white/12 py-2.5 text-center text-sm font-semibold text-white/70 hover:border-white/25 hover:text-white transition-colors"
                    >
                      Direct gebruiken
                    </a>
                  ) : (
                    <button
                      onClick={() => handleCheckout(key, 'subscription')}
                      disabled={!stripeReady || loading === key}
                      title={!stripeReady ? 'Betalingen worden binnenkort geactiveerd' : undefined}
                      className={`w-full rounded-xl py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        isBasic
                          ? 'bg-[#E8761A] text-white hover:bg-[#d06510]'
                          : 'border border-white/15 text-white hover:border-white/30'
                      }`}
                    >
                      {loading === key ? 'Laden...' : !stripeReady ? 'Binnenkort beschikbaar' : 'Aan de slag'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Losse credits */}
        <div className="mb-12 rounded-2xl border border-white/8 bg-[#111] p-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="font-condensed mb-1 text-2xl font-black text-white">Losse credits</h2>
              <p className="text-sm text-white/50">Geen abonnement nodig. Credits vervallen niet.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { key: 'single', ...LOSSE_CREDITS.single, label: '1 credit', sub: 'Eenmalige berekening' },
              { key: 'bundel', ...LOSSE_CREDITS.bundel, label: '10 credits bundel', sub: '€1,99 per berekening' },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-5 py-4">
                <div>
                  <p className="font-semibold text-white">{item.label}</p>
                  <p className="text-xs text-white/40">{item.sub}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-condensed text-xl font-black text-[#E8761A]">€{item.prijs}</span>
                  <button
                    onClick={() => handleCheckout(item.key, 'payment')}
                    disabled={!stripeReady || loading === item.key}
                    title={!stripeReady ? 'Binnenkort beschikbaar' : undefined}
                    className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:border-[#E8761A]/50 hover:text-[#E8761A] transition-colors disabled:opacity-40"
                  >
                    {loading === item.key ? '...' : 'Kopen'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise */}
        <div className="mb-12 rounded-2xl border border-white/8 bg-[#111] p-8">
          <h2 className="font-condensed mb-2 text-2xl font-black text-white">Custom / Enterprise</h2>
          <p className="mb-5 text-sm text-white/50">
            Meer dan 100 berekeningen per maand? Neem contact op voor maatwerk — inclusief API toegang, bulk import en prioriteit support.
          </p>
          <a
            href="mailto:info@earthgnd.com"
            className="inline-flex items-center gap-2 rounded-xl border border-[#E8761A]/30 px-5 py-2.5 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
          >
            Neem contact op
          </a>
        </div>

        {/* Guarantees */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { title: 'Per maand opzegbaar', desc: 'Geen jaarcontract. Opzeggen kan op elk moment.' },
            { title: 'AVG-compliant', desc: 'Gegevensopslag in EU. Geschikt voor NL, BE en DE.' },
            { title: 'Automatische factuur', desc: 'Maandelijkse factuur op bedrijfsnaam en BTW-nummer.' },
          ].map((g) => (
            <div key={g.title} className="rounded-xl border border-white/6 bg-white/2 px-5 py-4">
              <p className="mb-1 text-sm font-semibold text-white">{g.title}</p>
              <p className="text-xs text-white/40">{g.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
