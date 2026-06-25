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
 *   NL shallow peat (laagveen, gedraineerd poldergebied): 5–20 Ω·m.
 *   Field measurement Boskoop (veen/klei, GWT 0.3 m): ρ_apparent 10–11 Ω·m at all depths.
 *   Literature geometric mean for NL laagveen: ~10 Ω·m (CROW Handboek Aarding, TNO 2004).
 *   Prior: 10 Ω·m. Field calibration (Fase 1, n ≥ 5) may refine further.
 */

import { lithoClassToRhoWet } from '@/lib/calculations';

/** Corrected rhoWet priors for NL conditions, keyed by lithoClass. */
export const NL_RHO_WET_PRIOR: Partial<Record<number, number>> = {
  5: 10, // veen verzadigd: NL laagveen 5–20 Ω·m, geo.mean ~10 Ω·m (CROW/TNO); kernel tabel 400 is mineraal/droog
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
