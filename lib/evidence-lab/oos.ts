/**
 * Leave-one-site-out OOS validation for Poort 3.
 * Site-grouped splits only — no electrode-level leakage.
 */

import { computeAutoBayesianWeights } from './bayesian-weights';
import { mae, mapePct, mean, median } from './metrics';
import { POORT3, type GateStatusLevel } from './gate-config';
import type { LevelEstimate } from '@/lib/soil-knowledge/types';
import { getLiteratureLevel } from '@/lib/soil-knowledge/bayesian-posterior';

export type OosSiteObservation = {
  siteId: string;
  lithoClass: number;
  /** Observed empirical ρ at site (e.g. median wet rho). */
  actualRho: number;
};

export type OosFoldResult = {
  heldOutSiteId: string;
  lithoClass: number;
  actualRho: number;
  theoryRho: number;
  empiricalPredictRho: number;
  theoryAbsErr: number;
  empiricalAbsErr: number;
  trainSoftN: number;
  trainUniqueSites: number;
};

export type OosSummary = {
  folds: OosFoldResult[];
  heldOutSiteCount: number;
  lithologiesRepresented: number[];
  theoryMae: number | null;
  empiricalMae: number | null;
  theoryMape: number | null;
  empiricalMape: number | null;
  medianBiasEmpirical: number | null;
  deteriorationOk: boolean;
  passedTechnical: boolean;
  status: GateStatusLevel;
  blockers: string[];
};

/**
 * Build a simple LevelEstimate from training observations (sample mean/σ, n=count).
 * Soft_n approximated as unique training sites (conservative vs electrode soft_n).
 */
export function estimateFromSites(
  rhos: number[],
  softN: number,
): LevelEstimate | null {
  if (rhos.length < 1 || softN <= 0) return null;
  const mu = mean(rhos);
  if (mu == null || !(mu > 0)) return null;
  let sigma: number;
  if (rhos.length === 1) {
    sigma = Math.max(mu * 0.4, 1);
  } else {
    const m = mu;
    const v = rhos.reduce((s, r) => s + (r - m) ** 2, 0) / rhos.length;
    sigma = Math.max(Math.sqrt(v), 1e-6);
  }
  return { mu, sigma, n: softN };
}

/**
 * Leave-one-site-out:
 * for each site, train empirical prior on other sites of same lithology,
 * predict held-out rho via Bayesian posterior μ, compare to theory-only.
 */
export function runLeaveOneSiteOut(observations: OosSiteObservation[]): OosSummary {
  const byLitho = new Map<number, OosSiteObservation[]>();
  for (const o of observations) {
    const list = byLitho.get(o.lithoClass) ?? [];
    list.push(o);
    byLitho.set(o.lithoClass, list);
  }

  const folds: OosFoldResult[] = [];
  const blockers: string[] = [];

  for (const [lithoClass, sites] of Array.from(byLitho.entries())) {
    if (sites.length < 2) {
      blockers.push(
        `litho ${lithoClass}: <2 sites — geen holdout mogelijk`,
      );
      continue;
    }

    for (const held of sites) {
      const train = sites.filter((s: OosSiteObservation) => s.siteId !== held.siteId);
      const trainRhos = train.map((s: OosSiteObservation) => s.actualRho);
      const empirical = estimateFromSites(trainRhos, train.length);
      const weights = computeAutoBayesianWeights(lithoClass, empirical);
      const theory = getLiteratureLevel(lithoClass);
      const predict = weights.posterior?.mu ?? theory.mu;

      folds.push({
        heldOutSiteId: held.siteId,
        lithoClass,
        actualRho: held.actualRho,
        theoryRho: theory.mu,
        empiricalPredictRho: predict,
        theoryAbsErr: Math.abs(held.actualRho - theory.mu),
        empiricalAbsErr: Math.abs(held.actualRho - predict),
        trainSoftN: train.length,
        trainUniqueSites: train.length,
      });
    }
  }

  const actuals = folds.map(f => f.actualRho);
  const theoryPreds = folds.map(f => f.theoryRho);
  const empPreds = folds.map(f => f.empiricalPredictRho);

  const theoryMae = mae(actuals, theoryPreds);
  const empiricalMae = mae(actuals, empPreds);
  const theoryMape = mapePct(actuals, theoryPreds);
  const empiricalMape = mapePct(actuals, empPreds);

  const biases = folds.map(f => f.empiricalPredictRho - f.actualRho);
  const medianBiasEmpirical = median(biases);

  const uniqueSites = new Set(observations.map(o => o.siteId)).size;
  const lithologiesRepresented = Array.from(byLitho.keys()).sort((a, b) => a - b);

  if (uniqueSites < POORT3.minHeldOutSites) {
    blockers.push(
      `held-out sites ${uniqueSites} < min ${POORT3.minHeldOutSites}`,
    );
  }

  let deteriorationOk = true;
  if (theoryMae != null && empiricalMae != null && theoryMae > 0) {
    const ratio = empiricalMae / theoryMae;
    if (ratio > 1 + POORT3.maxDeteriorationVsTheory) {
      deteriorationOk = false;
      blockers.push(
        `empirische MAE ${empiricalMae.toFixed(2)} > theory×${(1 + POORT3.maxDeteriorationVsTheory).toFixed(2)} (${theoryMae.toFixed(2)})`,
      );
    }
  } else if (folds.length === 0) {
    deteriorationOk = false;
    blockers.push('geen OOS folds');
  }

  if (empiricalMape != null && empiricalMape > POORT3.maxMedianRelativeErrorPct) {
    blockers.push(
      `MAPE ${empiricalMape.toFixed(1)}% > max ${POORT3.maxMedianRelativeErrorPct}%`,
    );
  }

  const passedTechnical = folds.length > 0 && deteriorationOk && blockers.length === 0;

  let status: GateStatusLevel;
  if (folds.length === 0) status = 'INSUFFICIENT_DATA';
  else if (uniqueSites < POORT3.minHeldOutSites) status = 'BUILDING_EVIDENCE';
  else if (!passedTechnical) status = 'VALIDATING';
  else status = 'PASSING_TECHNICAL_GATES';
  // ELIGIBLE_FOR_HUMAN_REVIEW is set by Lab when all lithology gates + GeoTOP also pass —
  // never PRODUCTION_APPROVED automatically.

  return {
    folds,
    heldOutSiteCount: uniqueSites,
    lithologiesRepresented,
    theoryMae,
    empiricalMae,
    theoryMape,
    empiricalMape,
    medianBiasEmpirical,
    deteriorationOk,
    passedTechnical,
    status,
    blockers,
  };
}
