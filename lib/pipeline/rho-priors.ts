/**
 * NL-specific physics-based ρ priors for the calibration-adapter layer.
 *
 * The kernel (lib/calculations.ts) is NEVER modified. These corrections are
 * applied BEFORE the kernel in the pipeline (kernel-adapter, uncertainty).
 *
 * Sources:
 *   - Keller & Frischknecht (1966), Electrical Methods in Geophysical Prospecting
 *   - NEN-EN-IEC 60364-5-54:2011 Annex B (soil resistivity NL references)
 *   - RIVM Bodemkwaliteitskaart / TNO-rapport 2004 (NL veen-ρ veldmetingen)
 *
 * NL saturated peat (veen, lithoClass=5):
 *   Kernel table value: 400 Ω·m — based on mineral/semi-dry peat references.
 *   NL shallow peat (laagveen, gedraineerd poldergebied): 10–40 Ω·m.
 *   Geometric mean prior: 20 Ω·m (used until field calibration provides n ≥ 5).
 */

import { lithoClassToRhoWet } from '@/lib/calculations';

/** Corrected rhoWet priors for NL conditions, keyed by lithoClass. */
export const NL_RHO_WET_PRIOR: Partial<Record<number, number>> = {
  5: 20, // veen verzadigd: NL geo.mean 10–40 Ω·m; kernel tabel 400 Ω·m is voor mineraal/droog veen
};

/**
 * Resolves the two-layer rhoWet value for a given lithoClass.
 *
 * Priority:
 *   1. NL_RHO_WET_PRIOR — physics-based prior for NL conditions
 *   2. lithoClassToRhoWet — kernel WET table
 *   3. rho * 0.45 — ratio fallback when lithoClass unknown
 *
 * This function is the single source of truth for rhoWet in the pipeline.
 * Both kernel-adapter and uncertainty use it so the two-layer model is consistent.
 */
export function resolveRhoWet(lithoClass: number | null | undefined, rhoFallback: number): number {
  if (lithoClass == null) return Math.round(rhoFallback * 0.45);
  const tableValue = lithoClassToRhoWet(lithoClass);
  return NL_RHO_WET_PRIOR[lithoClass] ?? tableValue;
}
