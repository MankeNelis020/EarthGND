import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';
import { addCredits, setSubscriptionCredits } from '@/lib/credits';
import { getPlanByPriceId, LOSSE_CREDITS, PLANS, type PlanKey } from '@/lib/plans';
import { isValidCreditPurchase, totalCentsForCredits } from '@/lib/credit-slider';
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

/** Returns true if this Stripe event was already processed (idempotency guard). */
async function eventAlreadyProcessed(
  db: ReturnType<typeof adminSupabase>,
  eventId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .ilike('description', `%[stripe:${eventId}]%`)
    .limit(1)
    .single();
  return data != null;
}

function periodEndFromUnix(unix: number | null | undefined): Date {
  if (unix && unix > 0) return new Date(unix * 1000);
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function periodEndFromInvoice(invoice: Record<string, unknown>): Date {
  const lines = invoice.lines as { data?: Array<{ period?: { end?: number } }> } | undefined;
  const end = lines?.data?.[0]?.period?.end;
  return periodEndFromUnix(end);
}

async function subscriptionPeriodEnd(subscriptionId: string): Promise<Date> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const end = (sub as { current_period_end?: number }).current_period_end;
  return periodEndFromUnix(end);
}

function planCreditsForKey(planKey: PlanKey): number {
  return PLANS[planKey]?.credits ?? 0;
}

async function grantSubscriptionCredits(
  userId: string,
  planKey: PlanKey,
  label: string,
  nextReset: Date,
  stripeEventId: string,
): Promise<void> {
  const db = adminSupabase();
  if (await eventAlreadyProcessed(db, stripeEventId, userId)) return;

  await setSubscriptionCredits(userId, planKey, `${label} [stripe:${stripeEventId}]`, nextReset);
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
          if (await eventAlreadyProcessed(db, event.id, userId)) break;

          const fullSession = await getStripe().checkout.sessions.retrieve(sessionId, {
            expand: ['line_items'],
          });
          const priceId = fullSession.line_items?.data?.[0]?.price?.id;
          const found = priceId ? getPlanByPriceId(priceId) : null;
          const planKey = (found?.key ?? 'starter') as PlanKey;

          const nextReset = subscriptionId
            ? await subscriptionPeriodEnd(subscriptionId)
            : periodEndFromUnix(undefined);

          await db.from('profiles').update({
            plan: planKey,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          }).eq('id', userId);

          await grantSubscriptionCredits(
            userId,
            planKey,
            `Abonnement activatie — ${found?.plan.label ?? planKey} plan`,
            nextReset,
            event.id,
          );
        } else {
          if (await eventAlreadyProcessed(db, event.id, userId)) break;

          const fullSession = await getStripe().checkout.sessions.retrieve(sessionId, {
            expand: ['line_items'],
          });

          const creditCountRaw = metadata?.creditCount;
          const creditCount = creditCountRaw ? parseInt(creditCountRaw, 10) : NaN;

          if (isValidCreditPurchase(creditCount)) {
            const expectedCents = totalCentsForCredits(creditCount);
            if (fullSession.amount_total !== expectedCents) {
              console.error(`Credit slider amount mismatch: expected ${expectedCents}, got ${fullSession.amount_total}`);
              break;
            }
            await addCredits(userId, creditCount, `Credits aankoop — ${creditCount} credits (staffel) [stripe:${event.id}]`);
            break;
          }

          const priceId = fullSession.line_items?.data?.[0]?.price?.id;
          const creditEntry = Object.entries(LOSSE_CREDITS).find(([, c]) => c.stripe_price_id === priceId);
          if (creditEntry) {
            const [, credit] = creditEntry;
            await addCredits(userId, credit.credits, `Credits aankoop — ${credit.credits} credits [stripe:${event.id}]`);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Record<string, unknown>;
        const customerId = typeof sub.customer === 'string' ? sub.customer : null;
        if (!customerId) break;

        const userId = await getUserIdByCustomer(customerId);
        if (!userId) break;

        const status = sub.status as string | undefined;
        if (status !== 'active' && status !== 'trialing') break;

        const items = sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
        const priceId = items?.data?.[0]?.price?.id;
        const found = priceId ? getPlanByPriceId(priceId) : null;
        if (!found || found.key === 'gratis') break;

        const subscriptionId = typeof sub.id === 'string' ? sub.id : null;
        const nextReset = subscriptionId
          ? periodEndFromUnix(sub.current_period_end as number | undefined)
          : periodEndFromUnix(undefined);

        const { data: profile } = await db
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .single();

        const oldPlanKey = (profile?.plan ?? 'gratis') as PlanKey;
        const oldCredits = planCreditsForKey(oldPlanKey);
        const newCredits = found.plan.credits;

        await db.from('profiles').update({
          plan: found.key,
          stripe_subscription_id: subscriptionId,
          credits_reset: nextReset.toISOString(),
        }).eq('id', userId);

        // Upgrade mid-cycle on an existing paid plan (activation is handled by checkout.session.completed).
        if (oldPlanKey !== 'gratis' && newCredits > oldCredits) {
          await grantSubscriptionCredits(
            userId,
            found.key,
            `Plan upgrade — ${found.plan.label} plan`,
            nextReset,
            event.id,
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Record<string, unknown>;
        const customerId = typeof sub.customer === 'string' ? sub.customer : null;
        if (!customerId) break;
        const userId = await getUserIdByCustomer(customerId);
        if (!userId) break;

        // Downgrade to gratis — preserve credits_left and credits_purchased.
        await db.from('profiles').update({
          plan: 'gratis',
          stripe_subscription_id: null,
          credits_reset: null,
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

        if (await eventAlreadyProcessed(db, event.id, userId)) break;

        const { data: profile } = await db
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .single();

        const planKey = (profile?.plan ?? 'gratis') as PlanKey;
        if (planKey === 'gratis') break;

        const nextReset = periodEndFromInvoice(invoice);
        const planConfig = PLANS[planKey];

        await grantSubscriptionCredits(
          userId,
          planKey,
          `Maandelijkse reset — ${planConfig.label} plan`,
          nextReset,
          event.id,
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Record<string, unknown>;
        const customerEmail = invoice.customer_email as string | undefined;
        if (!customerEmail || !process.env.RESEND_API_KEY) break;

        const resend = new Resend(process.env.RESEND_API_KEY);
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
  } catch {
    // Webhook handler errors are swallowed to always return 200 to Stripe.
    // Stripe will retry on non-200 responses, which could cause duplicate processing.
  }

  return NextResponse.json({ received: true });
}
