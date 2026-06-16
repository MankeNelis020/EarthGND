import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';
import { addCredits, resetMonthlyCredits } from '@/lib/credits';
import { getPlanByPriceId, LOSSE_CREDITS, type PlanKey } from '@/lib/plans';
import { Resend } from 'resend';

export const runtime = 'nodejs';

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getUserIdByCustomer(customerId: string): Promise<string | null> {
  const { data } = await adminSupabase()
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = adminSupabase();

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Record<string, unknown>;
        const metadata = session.metadata as Record<string, string> | undefined;
        const userId = metadata?.userId;
        if (!userId) break;

        const customerId = typeof session.customer === 'string' ? session.customer : null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        const sessionId = session.id as string;
        const sessionMode = session.mode as string;

        if (sessionMode === 'subscription') {
          // Retrieve line items to get price ID
          const fullSession = await getStripe().checkout.sessions.retrieve(sessionId, {
            expand: ['line_items'],
          });
          const priceId = fullSession.line_items?.data?.[0]?.price?.id;
          const found = priceId ? getPlanByPriceId(priceId) : null;
          const planKey = found?.key ?? 'starter';
          const planCredits = found?.plan.credits ?? 10;

          await db.from('profiles').update({
            plan: planKey,
            credits_left: planCredits,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          }).eq('id', userId);

          await db.from('credit_transactions').insert({
            user_id: userId,
            type: 'purchase',
            credits: planCredits,
            description: `Abonnement activatie — ${found?.plan.label ?? planKey} plan`,
          });
        } else {
          // One-time credit purchase
          const fullSession = await getStripe().checkout.sessions.retrieve(sessionId, {
            expand: ['line_items'],
          });
          const priceId = fullSession.line_items?.data?.[0]?.price?.id;
          const creditEntry = Object.entries(LOSSE_CREDITS).find(([, c]) => c.stripe_price_id === priceId);
          if (creditEntry) {
            const [, credit] = creditEntry;
            await addCredits(userId, credit.credits, `Credits aankoop — ${credit.credits} credits`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Record<string, unknown>;
        const customerId = typeof sub.customer === 'string' ? sub.customer : null;
        if (!customerId) break;
        const userId = await getUserIdByCustomer(customerId);
        if (!userId) break;

        await db.from('profiles').update({
          plan: 'gratis',
          credits_left: 0,
          stripe_subscription_id: null,
        }).eq('id', userId);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Record<string, unknown>;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
        if (!customerId) break;
        const userId = await getUserIdByCustomer(customerId);
        if (!userId) break;

        const { data: profile } = await db
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .single();

        if (profile?.plan && profile.plan !== 'gratis') {
          await resetMonthlyCredits(userId, profile.plan as PlanKey);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Record<string, unknown>;
        const customerEmail = invoice.customer_email as string | undefined;
        if (!customerEmail) break;

        const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder');
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? 'EarthGND <noreply@earthgnd.com>',
          to: customerEmail,
          subject: 'Betaling mislukt — update je betaalmethode',
          text: [
            'Hallo,',
            '',
            'Je betaling voor EarthGND is mislukt.',
            'Ga naar earthgnd.com/dashboard om je betaalmethode bij te werken.',
            '',
            'EarthGND',
          ].join('\n'),
        });
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  return NextResponse.json({ received: true });
}
