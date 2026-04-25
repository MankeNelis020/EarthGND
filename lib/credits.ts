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

export async function deductCredit(userId: string): Promise<{ ok: boolean; remaining: number }> {
  const db = adminClient();

  const { data: profile } = await db
    .from('profiles')
    .select('credits_left')
    .eq('id', userId)
    .single();

  const current = profile?.credits_left ?? 0;
  if (current <= 0) return { ok: false, remaining: 0 };

  const newTotal = current - 1;

  await db.from('profiles').update({ credits_left: newTotal }).eq('id', userId);
  await db.from('credit_transactions').insert({
    user_id: userId,
    type: 'used',
    credits: -1,
    description: 'Pendiepte berekening',
  });

  return { ok: true, remaining: newTotal };
}

export async function addCredits(userId: string, amount: number, description: string): Promise<void> {
  const db = adminClient();

  const { data: profile } = await db
    .from('profiles')
    .select('credits_left')
    .eq('id', userId)
    .single();

  const current = profile?.credits_left ?? 0;

  await db.from('profiles').update({ credits_left: current + amount }).eq('id', userId);
  await db.from('credit_transactions').insert({
    user_id: userId,
    type: 'purchase',
    credits: amount,
    description,
  });
}

export async function resetMonthlyCredits(userId: string, plan: PlanKey): Promise<void> {
  const planConfig = PLANS[plan];
  if (!planConfig || planConfig.credits === 0) return;

  const db = adminClient();
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1);

  await db.from('profiles').update({
    credits_left: planConfig.credits,
    credits_reset: nextReset.toISOString(),
  }).eq('id', userId);

  await db.from('credit_transactions').insert({
    user_id: userId,
    type: 'subscription_reset',
    credits: planConfig.credits,
    description: `Maandelijkse reset — ${planConfig.label} plan`,
  });
}
