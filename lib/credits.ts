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
 * Atomically deduct one credit via a Postgres function that uses FOR UPDATE
 * to prevent the read-then-write race condition that could allow free calculations.
 * The audit record is inserted in the same transaction as the decrement.
 */
export async function deductCredit(userId: string): Promise<{ ok: boolean; remaining: number }> {
  const { data, error } = await adminClient().rpc('deduct_credit', { p_user_id: userId });
  if (error || !Array.isArray(data) || !data.length) return { ok: false, remaining: 0 };
  return { ok: Boolean(data[0].ok), remaining: Number(data[0].remaining) };
}

/**
 * Atomically add credits and record an audit entry in the same transaction.
 */
export async function addCredits(userId: string, amount: number, description: string): Promise<void> {
  await adminClient().rpc('add_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
  });
}

/**
 * Atomically reset credits to the plan's monthly allowance and record an audit entry.
 */
export async function resetMonthlyCredits(userId: string, plan: PlanKey): Promise<void> {
  const planConfig = PLANS[plan];
  if (!planConfig || planConfig.credits === 0) return;

  await adminClient().rpc('reset_monthly_credits', {
    p_user_id: userId,
    p_credits: planConfig.credits,
    p_label: `Maandelijkse reset — ${planConfig.label} plan`,
  });
}
