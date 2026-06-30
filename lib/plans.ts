export const PLANS = {
  gratis:  { label: 'Gratis',  prijs: 0,   credits: 0,   stripe_price_id: null },
  starter: { label: 'Starter', prijs: 39,  credits: 10,  stripe_price_id: process.env.STRIPE_PRICE_STARTER ?? 'price_starter' },
  basic:   { label: 'Basic',   prijs: 80,  credits: 50,  stripe_price_id: process.env.STRIPE_PRICE_BASIC   ?? 'price_basic' },
  pro:     { label: 'Pro',     prijs: 129, credits: 150, stripe_price_id: process.env.STRIPE_PRICE_PRO     ?? 'price_pro' },
} as const;

export type PlanKey = keyof typeof PLANS;

export const LOSSE_CREDITS = {
  single:   { credits: 1,  prijs: 5.95,  stripe_price_id: process.env.STRIPE_PRICE_CREDIT_1  ?? 'price_credit_1' },
  bundel:   { credits: 10, prijs: 50,    stripe_price_id: process.env.STRIPE_PRICE_CREDIT_10 ?? 'price_credit_10' },
  bundel50: { credits: 50, prijs: 99,    stripe_price_id: process.env.STRIPE_PRICE_CREDIT_50 ?? 'price_credit_50' },
} as const;

export type LosseCreditKey = keyof typeof LOSSE_CREDITS;

export function getPlanByPriceId(priceId: string): { key: PlanKey; plan: typeof PLANS[PlanKey] } | null {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.stripe_price_id === priceId) return { key: key as PlanKey, plan };
  }
  return null;
}

export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder');
}
