/**
 * Empirical activation policy — Poort 4 controlled activation.
 * Defaults: shadow, enabled=false. Never auto-approves production.
 */

import { GRIND_CLASS } from '@/lib/soil-knowledge/priors';
import { POORT4 } from './gate-config';

export type PolicyMode = 'shadow' | 'auto' | 'capped_auto' | 'manual';

export type EmpiricalWeightPolicy = {
  lithoClass: number;
  mode: PolicyMode;
  empiricalCapPercent: number;
  manualEmpiricalPercent: number;
  minSoftN: number;
  minUniqueSites: number;
  minAgreementScore: number;
  poort3Required: boolean;
  enabled: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reason: string | null;
  updatedAt: string | null;
};

export type EffectiveWeights = {
  autoBayesianPercent: number;
  policyCapPercent: number | null;
  productionEmpiricalPercent: number;
  mode: PolicyMode;
  blockedReason: string | null;
};

export function defaultPolicy(lithoClass: number): EmpiricalWeightPolicy {
  return {
    lithoClass,
    mode: POORT4.defaultMode,
    empiricalCapPercent: POORT4.defaultEmpiricalCapPercent,
    manualEmpiricalPercent: 0,
    minSoftN: 5,
    minUniqueSites: 3,
    minAgreementScore: 0.55,
    poort3Required: true,
    enabled: POORT4.defaultEnabled,
    reviewedBy: null,
    reviewedAt: null,
    reason: null,
    updatedAt: null,
  };
}

/**
 * Resolve display/production empirical % from policy + Bayesian AUTO.
 * Does NOT mutate env or pipeline — Lab / future activation only.
 */
export function resolveEffectiveEmpiricalPercent(
  policy: EmpiricalWeightPolicy,
  autoBayesian01: number,
  opts: {
    softN: number;
    uniqueSites: number;
    agreementScore: number | null;
    poort3Passed: boolean;
    soilKnowledgeActive: boolean;
  },
): EffectiveWeights {
  const autoPct = Math.max(0, Math.min(100, autoBayesian01 * 100));

  if (policy.lithoClass === GRIND_CLASS && POORT4.grindAlwaysBlocked) {
    return {
      autoBayesianPercent: autoPct,
      policyCapPercent: policy.empiricalCapPercent,
      productionEmpiricalPercent: 0,
      mode: policy.mode,
      blockedReason: 'LEARNING BLOCKED — grind',
    };
  }

  if (!policy.enabled || policy.mode === 'shadow') {
    return {
      autoBayesianPercent: autoPct,
      policyCapPercent: policy.mode === 'capped_auto' ? policy.empiricalCapPercent : null,
      productionEmpiricalPercent: 0,
      mode: policy.mode,
      blockedReason: !policy.enabled
        ? 'Policy disabled (default shadow)'
        : 'Mode = shadow — productie 0% empirisch',
    };
  }

  if (policy.poort3Required && !opts.poort3Passed) {
    return {
      autoBayesianPercent: autoPct,
      policyCapPercent: policy.empiricalCapPercent,
      productionEmpiricalPercent: 0,
      mode: policy.mode,
      blockedReason: 'Poort 3 OOS niet gehaald',
    };
  }

  if (opts.softN < policy.minSoftN) {
    return {
      autoBayesianPercent: autoPct,
      policyCapPercent: policy.empiricalCapPercent,
      productionEmpiricalPercent: 0,
      mode: policy.mode,
      blockedReason: `soft_n ${opts.softN.toFixed(1)} < min ${policy.minSoftN}`,
    };
  }

  if (opts.uniqueSites < policy.minUniqueSites) {
    return {
      autoBayesianPercent: autoPct,
      policyCapPercent: policy.empiricalCapPercent,
      productionEmpiricalPercent: 0,
      mode: policy.mode,
      blockedReason: `unique sites ${opts.uniqueSites} < min ${policy.minUniqueSites}`,
    };
  }

  if (
    opts.agreementScore != null &&
    opts.agreementScore < policy.minAgreementScore
  ) {
    return {
      autoBayesianPercent: autoPct,
      policyCapPercent: policy.empiricalCapPercent,
      productionEmpiricalPercent: 0,
      mode: policy.mode,
      blockedReason: `agreement ${opts.agreementScore.toFixed(2)} < min ${policy.minAgreementScore}`,
    };
  }

  // Even if policy enabled, production env may still be inactive —
  // Lab reports "would-be" production weight under policy, but actual
  // live influence remains 0 unless SOIL_KNOWLEDGE_ACTIVE (shown separately).
  let production = 0;
  if (policy.mode === 'auto') {
    production = autoPct;
  } else if (policy.mode === 'capped_auto') {
    production = Math.min(autoPct, policy.empiricalCapPercent);
  } else if (policy.mode === 'manual') {
    production = Math.max(0, Math.min(100, policy.manualEmpiricalPercent));
  }

  return {
    autoBayesianPercent: autoPct,
    policyCapPercent: policy.mode === 'capped_auto' ? policy.empiricalCapPercent : null,
    productionEmpiricalPercent: production,
    mode: policy.mode,
    blockedReason: !opts.soilKnowledgeActive
      ? 'Policy zou activeren, maar SOIL_KNOWLEDGE_ACTIVE=false — live blijft 0%'
      : null,
  };
}
