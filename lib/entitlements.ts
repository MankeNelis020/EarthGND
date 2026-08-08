/**
 * Centralized feature entitlements — do not scatter plan-name checks in UI/API.
 * Tenant today = profile.plan (no org entity yet).
 */

import { PLANS, type PlanKey } from '@/lib/plans';

export type FeatureKey =
  | 'klic_readiness'
  | 'klic_api_integration'
  | 'profile_logo';

const PLAN_FEATURES: Record<PlanKey, Record<FeatureKey, boolean>> = {
  gratis: {
    klic_readiness: true,
    klic_api_integration: false,
    profile_logo: false,
  },
  starter: {
    klic_readiness: true,
    klic_api_integration: false,
    profile_logo: false,
  },
  basic: {
    klic_readiness: true,
    klic_api_integration: false,
    profile_logo: false,
  },
  pro: {
    klic_readiness: true,
    klic_api_integration: true,
    profile_logo: true,
  },
};

export function normalizePlanKey(plan: string | null | undefined): PlanKey {
  if (plan && plan in PLANS) return plan as PlanKey;
  return 'gratis';
}

export function canUseFeature(
  planOrOrg: string | { plan?: string | null } | null | undefined,
  feature: FeatureKey,
): boolean {
  const plan =
    typeof planOrOrg === 'string'
      ? planOrOrg
      : planOrOrg?.plan ?? 'gratis';
  const key = normalizePlanKey(plan);
  return PLAN_FEATURES[key][feature] === true;
}

export function getPlanFeatures(plan: string | null | undefined): Record<FeatureKey, boolean> {
  return { ...PLAN_FEATURES[normalizePlanKey(plan)] };
}
