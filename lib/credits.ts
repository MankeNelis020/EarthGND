import { createClient } from '@supabase/supabase-js';
import { PLANS, type PlanKey } from './plans';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getCreditsLeft(userId: string): Promise<number> {
  const { data } = await adminClient()
    .from('profiles')
    .select('credits_left')
    .eq('id', userId)
    .single();
  return data?.credits_left ?? 0;
}

export async function getPlan(userId: string): Promise<PlanKey> {
  const { data } = await adminClient()
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();
  return (data?.plan ?? 'gratis') as PlanKey;
}

/**
 * Atomically deduct one credit. Subscription pool is consumed first, then purchased.
 */
export async function deductCredit(
  userId: string,
): Promise<{ ok: boolean; remaining: number; fromPurchased: boolean }> {
  const { data, error } = await adminClient().rpc('deduct_credit', { p_user_id: userId });
  if (error || !Array.isArray(data) || !data.length) {
    return { ok: false, remaining: 0, fromPurchased: false };
  }
  return {
    ok: Boolean(data[0].ok),
    remaining: Number(data[0].remaining),
    fromPurchased: Boolean(data[0].from_purchased),
  };
}

/** Refund one credit to the pool it was taken from (subscription vs purchased). */
export async function releaseCredit(
  userId: string,
  fromPurchased: boolean,
  description: string,
): Promise<void> {
  await adminClient().rpc('release_credit', {
    p_user_id: userId,
    p_from_purchased: fromPurchased,
    p_description: description,
  });
}

/** Loose / one-time credits — added to the purchased pool only. */
export async function addCredits(userId: string, amount: number, description: string): Promise<void> {
  await adminClient().rpc('add_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
  });
}

/**
 * Set subscription credits to plan quota; purchased credits are preserved.
 * nextReset should align with Stripe current_period_end when available.
 */
export async function setSubscriptionCredits(
  userId: string,
  plan: PlanKey,
  label: string,
  nextReset: Date,
): Promise<void> {
  const planConfig = PLANS[plan];
  if (!planConfig || planConfig.credits === 0) return;

  await adminClient().rpc('set_subscription_credits', {
    p_user_id: userId,
    p_credits: planConfig.credits,
    p_label: label,
    p_next_reset: nextReset.toISOString(),
  });
}

/** @deprecated Use setSubscriptionCredits with Stripe period end. */
export async function resetMonthlyCredits(userId: string, plan: PlanKey): Promise<void> {
  const planConfig = PLANS[plan];
  if (!planConfig || planConfig.credits === 0) return;

  await adminClient().rpc('reset_monthly_credits', {
    p_user_id: userId,
    p_credits: planConfig.credits,
    p_label: `Maandelijkse reset — ${planConfig.label} plan`,
  });
}
