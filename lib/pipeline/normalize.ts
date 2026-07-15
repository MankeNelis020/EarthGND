/**
 * Stage 3 — Semantic normalization.
 * Applied ONLY on data that passed intake-validation (class A).
 * Rounds floating-point noise, fills optional fields with defaults.
 * These are NOT silent corrections of bad data — they are cosmetic/display fixes
 * on already-valid data. Each normalization is named explicitly.
 */

import type { ValidatedDiepteInput } from './parse';

/** Round floating-point noise: 0.9500000002 → 0.95, 2.4999999 → 2.5 */
function roundNoise(v: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

/** Clamp pH to valid range [0, 14] after rounding (defensive, should not trigger after validate) */
function clampPh(v: number): number {
  return Math.max(0, Math.min(14, v));
}

export function normalizeDiepteInput(input: ValidatedDiepteInput): ValidatedDiepteInput {
  return {
    ...input,
    // Float-noise reduction on measurement values
    rho:              roundNoise(input.rho,              2),
    targetResistance: roundNoise(input.targetResistance, 4),
    groundwaterDepth: roundNoise(input.groundwaterDepth, 2),
    ph:               clampPh(roundNoise(input.ph, 2)),
    // Optional overrides
    rhoDryOverride: input.rhoDryOverride != null
      ? roundNoise(input.rhoDryOverride, 2)
      : undefined,
    lintBurialDepth:       roundNoise(input.lintBurialDepth,       3),
    lintConductorDiameter: roundNoise(input.lintConductorDiameter, 5),
    boringAfstand: input.boringAfstand != null
      ? roundNoise(input.boringAfstand, 3)
      : undefined,
    electrodeDiameterMm: roundNoise(input.electrodeDiameterMm, 1),
  };
}
