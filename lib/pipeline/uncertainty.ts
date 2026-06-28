/**
 * Stage 8 — Uncertainty band (ρ-axis).
 *
 * Calls the kernel 3× with ρ_low / ρ_typical / ρ_high.
 * This is ORTHOGONAL to the seasonal GWT scenarios (gunstig/gemiddeld/ongunstig).
 * The band quantifies how much the result changes if the soil ρ is ±X% off.
 *
 * Reported value: primary dimension of the gemiddeld seasonal scenario.
 * Lower ρ → lower resistance → shallower required depth (optimistic).
 * Higher ρ → higher resistance → deeper required depth (conservative).
 */

import { calcDiepte, calcLint, lithoClassToRhoDry } from '@/lib/calculations';
import type { ValidatedDiepteInput } from './parse';
import type { UncertaintyBand, ConfidenceLevel } from './types';
import { UNCERTAINTY_FACTORS } from './config';
import { resolveRhoWet } from './rho-priors';

function primaryDim(s: { depth?: number; length?: number }): number {
  return s.depth ?? s.length ?? 0;
}

export function computeUncertaintyBand(
  input: ValidatedDiepteInput,
  confidenceLevel: ConfidenceLevel,
): UncertaintyBand {
  const factors = UNCERTAINTY_FACTORS[confidenceLevel] ?? UNCERTAINTY_FACTORS.laag;
  const { factorLow, factorHigh } = factors;

  const { rho, targetResistance, groundwaterDepth, electrodeType,
          lintBurialDepth, lintConductorDiameter } = input;

  const gwMid = groundwaterDepth + 1.5; // gemiddeld scenario GWT

  // Resolve base rhoWet once — prefer empirical override from Stage 6.5 active prior,
  // fall back to static NL literature prior. Scale proportionally for low/high scenarios.
  const rhoWetBase = input.rhoWetOverride ?? resolveRhoWet(input.lithoClass, rho);

  function runWithRho(rhoFactor: number): number {
    const rhoScaled    = rho * rhoFactor;
    const rhoWetScaled = rhoWetBase * rhoFactor;

    if (electrodeType === 'lint') {
      const burial      = lintBurialDepth;
      const rhoDryScaled = input.rhoDryOverride != null
        ? input.rhoDryOverride * rhoFactor
        : input.lithoClass
          ? lithoClassToRhoDry(input.lithoClass) * rhoFactor
          : Math.round(rhoScaled * 2.2);
      const rhoEff = burial < gwMid ? rhoWetScaled : rhoDryScaled;
      const result = calcLint({ rho: rhoEff, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter });
      return primaryDim(result);
    }

    // Pen: scale both dry and wet layers proportionally.
    const rhoDryScaled = input.rhoDryOverride != null
      ? input.rhoDryOverride * rhoFactor
      : input.lithoClass
        ? lithoClassToRhoDry(input.lithoClass) * rhoFactor
        : Math.round(rhoScaled * 2.2);
    // rhoWetScaled computed in outer scope via resolveRhoWet (NL empirische priors)

    const result = calcDiepte({
      rho: rhoScaled,
      targetResistance,
      gwDepth: gwMid,
      rhoDry: rhoDryScaled,
      rhoWet: rhoWetScaled,
      soilSamples: input.soilSamples,
      rhoScale: rhoFactor,
    });
    return primaryDim(result);
  }

  const typical = runWithRho(1.0);
  const low     = runWithRho(factorLow);
  const high    = runWithRho(factorHigh);

  return {
    typical: Math.round(typical * 100) / 100,
    low:     Math.round(low     * 100) / 100,
    high:    Math.round(high    * 100) / 100,
    rhoFactorLow:  factorLow,
    rhoFactorHigh: factorHigh,
  };
}
