/**
 * Bayesian precision weights for Lab display.
 * Reuses the same precision formula as bayesian-posterior.ts.
 * AUTO weights are evidence-derived only — never production weights.
 */

import { LITERATURE_PRIOR } from '@/lib/soil-knowledge/priors';
import { computePosterior, getLiteratureLevel } from '@/lib/soil-knowledge/bayesian-posterior';
import type { LevelEstimate } from '@/lib/soil-knowledge/types';
import { GRIND_CLASS } from '@/lib/soil-knowledge/priors';

export type BayesianWeightBreakdown = {
  lithoClass: number;
  learningBlocked: boolean;
  theory: LevelEstimate;
  empirical: LevelEstimate | null;
  theoryPrecision: number;
  empiricalPrecision: number;
  autoTheoryWeight: number;
  autoEmpiricalWeight: number;
  posterior: LevelEstimate | null;
  /** Always distinct from AUTO — Lab reads env/policy separately. */
  note: string;
};

export function precision(n: number, sigma: number): number {
  if (!(sigma > 0) || !(n > 0)) return 0;
  return n / (sigma * sigma);
}

export function weightsFromPrecisions(
  theoryPrecision: number,
  empiricalPrecision: number,
): { theory: number; empirical: number } {
  const total = theoryPrecision + empiricalPrecision;
  if (total <= 0) return { theory: 1, empirical: 0 };
  return {
    theory: theoryPrecision / total,
    empirical: empiricalPrecision / total,
  };
}

/**
 * Safe L1 + single empirical level (same independence assumption as computeSafePosterior).
 */
export function computeAutoBayesianWeights(
  lithoClass: number,
  empirical: LevelEstimate | null,
): BayesianWeightBreakdown {
  const theory = getLiteratureLevel(lithoClass);
  const learningBlocked = lithoClass === GRIND_CLASS;
  const theoryPrecision = precision(theory.n, theory.sigma);

  if (learningBlocked || !empirical || !(empirical.n > 0) || !(empirical.sigma > 0)) {
    return {
      lithoClass,
      learningBlocked,
      theory,
      empirical: learningBlocked ? empirical : empirical,
      theoryPrecision,
      empiricalPrecision: 0,
      autoTheoryWeight: 1,
      autoEmpiricalWeight: 0,
      posterior: theory,
      note: learningBlocked
        ? 'LEARNING BLOCKED — grind blijft theorie-only'
        : 'Onvoldoende empirisch bewijs — AUTO = 100% theorie',
    };
  }

  const empiricalPrecision = precision(empirical.n, empirical.sigma);
  const w = weightsFromPrecisions(theoryPrecision, empiricalPrecision);
  const posterior = computePosterior(theory, empirical);

  return {
    lithoClass,
    learningBlocked: false,
    theory,
    empirical,
    theoryPrecision,
    empiricalPrecision,
    autoTheoryWeight: w.theory,
    autoEmpiricalWeight: w.empirical,
    posterior,
    note: 'AUTO = precisiegewogen L1 + empirisch niveau (niet productie)',
  };
}

/** Manual blend — NOT Bayesian. Simulation only. */
export function manualBlendRho(theoryRho: number, empiricalRho: number, empiricalWeight01: number): number {
  const w = Math.min(1, Math.max(0, empiricalWeight01));
  return theoryRho * (1 - w) + empiricalRho * w;
}

export function literatureMeta(lithoClass: number) {
  return LITERATURE_PRIOR[lithoClass] ?? LITERATURE_PRIOR[3];
}
