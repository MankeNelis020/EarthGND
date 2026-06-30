'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import {
  CREDIT_SLIDER_MAX,
  CREDIT_SLIDER_MIN,
  CREDIT_SLIDER_PRESETS,
  discountPercentForCredits,
  savingsForCredits,
  totalPriceForCredits,
  unitPriceForCredits,
} from '@/lib/credit-slider';
import { formatPriceCompact } from '@/lib/pricing';
import { createClient } from '@/utils/supabase/client';

interface Props {
  stripeReady?: boolean;
  onError?: (msg: string) => void;
}

export function CreditSliderPurchase({ stripeReady = true, onError }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const [credits, setCredits] = useState(10);
  const [loading, setLoading] = useState(false);

  const unitPrice  = useMemo(() => unitPriceForCredits(credits), [credits]);
  const totalPrice = useMemo(() => totalPriceForCredits(credits), [credits]);
  const savings    = useMemo(() => savingsForCredits(credits), [credits]);
  const discount   = useMemo(() => discountPercentForCredits(credits), [credits]);

  async function handleBuy() {
    setLoading(true);
    onError?.('');
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'payment', locale, credits }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        onError?.(data.error ?? 'Checkout mislukt');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E8761A]/25 bg-gradient-to-b from-[#E8761A]/6 to-[#111] p-5 sm:p-8">
      <div className="mb-6 text-center sm:text-left">
        <h2 className="font-condensed text-xl font-black text-white sm:text-2xl">Losse credits</h2>
        <p className="mt-1 text-sm text-white/50">Kies hoeveel berekeningen u nodig heeft. Meer credits = lagere stukprijs.</p>
      </div>

      {/* Mobile-first: groot aantal */}
      <div className="mb-6 flex flex-col items-center gap-1 sm:items-start">
        <output
          htmlFor="credit-slider"
          className="font-condensed text-5xl font-black tabular-nums text-[#E8761A] sm:text-6xl"
        >
          {credits}
        </output>
        <p className="text-sm text-white/45">
          {credits === 1 ? 'credit' : 'credits'} · {formatPriceCompact(unitPrice, locale)} per stuk
        </p>
      </div>

      {/* Presets */}
      <div className="mb-4 flex gap-2">
        {CREDIT_SLIDER_PRESETS.map(preset => (
          <button
            key={preset}
            type="button"
            onClick={() => setCredits(preset)}
            className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
              credits === preset
                ? 'border-[#E8761A] bg-[#E8761A]/15 text-[#E8761A]'
                : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Slider — touch-friendly */}
      <div className="mb-6 px-1">
        <input
          id="credit-slider"
          type="range"
          min={CREDIT_SLIDER_MIN}
          max={CREDIT_SLIDER_MAX}
          step={1}
          value={credits}
          onChange={e => setCredits(Number(e.target.value))}
          style={{ '--slider-progress': `${((credits - CREDIT_SLIDER_MIN) / (CREDIT_SLIDER_MAX - CREDIT_SLIDER_MIN)) * 100}%` } as React.CSSProperties}
          className="credit-slider w-full touch-pan-y"
          aria-label="Aantal credits"
          aria-valuemin={CREDIT_SLIDER_MIN}
          aria-valuemax={CREDIT_SLIDER_MAX}
          aria-valuenow={credits}
        />
        <div className="mt-2 flex justify-between text-[10px] text-white/30">
          <span>{CREDIT_SLIDER_MIN}</span>
          <span>10</span>
          <span>50</span>
          <span>{CREDIT_SLIDER_MAX}</span>
        </div>
      </div>

      {/* Prijs samenvatting */}
      <div className="mb-5 rounded-xl border border-white/8 bg-black/20 px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-white/50">Totaal</span>
          <span className="font-condensed text-2xl font-black text-white">{formatPriceCompact(totalPrice, locale)}</span>
        </div>
        {discount > 0 && (
          <p className="mt-1 text-right text-xs text-green-400">
            {discount}% staffelkorting · bespaar {formatPriceCompact(savings, locale)}
          </p>
        )}
        <p className="mt-2 text-[10px] text-white/35">Credits vervallen niet. Geen abonnement.</p>
      </div>

      <button
        type="button"
        onClick={handleBuy}
        disabled={!stripeReady || loading}
        className="w-full rounded-xl bg-[#E8761A] py-3.5 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Doorverbinden…' : `Koop ${credits} ${credits === 1 ? 'credit' : 'credits'}`}
      </button>
    </div>
  );
}
