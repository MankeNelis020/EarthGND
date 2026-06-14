import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getStripe } from '@/lib/stripe';
import { stripeConfigured, PLANS, LOSSE_CREDITS } from '@/lib/plans';

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

  const body = await request.json() as { planKey: string; mode?: 'subscription' | 'payment' };
  const { planKey, mode = 'subscription' } = body;

  const priceId = resolvePriceId(planKey);
  if (!priceId) {
    return NextResponse.json({ error: `Onbekend plan: ${planKey}` }, { status: 400 });
  }

  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earthgnd.com';

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      metadata: { userId: user.id },
      success_url: `${baseUrl}/nl/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/nl/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
