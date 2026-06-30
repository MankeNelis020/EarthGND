import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getStripe } from '@/lib/stripe';
import { stripeConfigured, PLANS, LOSSE_CREDITS } from '@/lib/plans';
import { clampCredits, isValidCreditPurchase, totalCentsForCredits, totalPriceForCredits } from '@/lib/credit-slider';

function resolvePriceId(planKey: string): string | null {
  if (planKey in PLANS) {
    return PLANS[planKey as keyof typeof PLANS].stripe_price_id ?? null;
  }
  if (planKey in LOSSE_CREDITS) {
    return LOSSE_CREDITS[planKey as keyof typeof LOSSE_CREDITS].stripe_price_id ?? null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe niet geconfigureerd' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const body = await request.json() as {
    planKey?: string;
    credits?: number;
    mode?: 'subscription' | 'payment';
    locale?: string;
  };
  const { planKey, mode = 'subscription', locale = 'nl', credits: creditsRaw } = body;

  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earthgnd.com';

  try {
    // ── Schuif-aankoop: dynamisch bedrag op staffel ─────────────────────────
    if (creditsRaw != null) {
      const credits = clampCredits(creditsRaw);
      if (!isValidCreditPurchase(credits)) {
        return NextResponse.json({ error: 'Ongeldig aantal credits (1–100)' }, { status: 400 });
      }

      const totalCents = totalCentsForCredits(credits);
      const totalEuros = totalPriceForCredits(credits);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            unit_amount: totalCents,
            product_data: {
              name: `${credits} EarthGND credit${credits === 1 ? '' : 's'}`,
              description: `Pendiepte Calculator — ${totalEuros.toFixed(2).replace('.', ',')} eenmalig`,
            },
          },
          quantity: 1,
        }],
        customer_email: user.email,
        metadata: {
          userId: user.id,
          creditCount: String(credits),
          pricingModel: 'slider',
        },
        success_url: `${baseUrl}/${locale}/dashboard?checkout=success`,
        cancel_url: `${baseUrl}/${locale}/pricing`,
      });

      return NextResponse.json({ url: session.url });
    }

    // ── Vaste plans / legacy packs ──────────────────────────────────────────
    if (!planKey) {
      return NextResponse.json({ error: 'planKey of credits vereist' }, { status: 400 });
    }

    const priceId = resolvePriceId(planKey);
    if (!priceId) {
      return NextResponse.json({ error: `Onbekend plan: ${planKey}` }, { status: 400 });
    }

    if (priceId.length < 15) {
      return NextResponse.json({ error: 'Stripe prijs-ID niet geconfigureerd voor dit plan' }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      metadata: { userId: user.id },
      success_url: `${baseUrl}/${locale}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/${locale}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
