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
 *   - EarthGND-veldmetingen.xlsx (2026-06): n=20 depth points, 5 locaties NL
 *
 * Empirische onderbouwing (Fase 0, 2026-06):
 *   Alle correct-geclassificeerde meetpunten tonen een consistente ~2.8× factor
 *   tussen kernel WET-tabel en gemeten ρ_apparent bij verzadigde NL grond.
 *
 *   Kernel WET-tabel gebruikt internationale referentiewaarden (droog/mineraal).
 *   NL grond is doorgaans: (1) natter door hoge GWT, (2) kleiiger (mariene afzetting),
 *   (3) hogere ionenconcentratie (polderwater, Holocene klei). Dat verklaart de factor.
 *
 *   Geclassificeerd als tabel-kalibratie (niet misclassificatie-correctie):
 *   Boskoop/Haarlem zijn UIT de tabel gelaten — BRO zei 'zand' maar het is veen/klei.
 *   Dat is een datakwaliteitsprobleem, geen ρ-tabelfout.
 *
 * Priors per lithoClass (NL verzadigd):
 *   lithoClass=1 (klei):   kernel=15, gemeten ~10, factor 1.5×. Referentie: NEN 60364-5-54
 *                           Annex B (NL mariene klei 8–15 Ω·m). Prior: 10 Ω·m.
 *                           Let op: Boskoop-meting (veen/klei BRO=zand) is NIET gebruikt.
 *                           Extrapolatie van globale 2.8× factor op GENERAL tabel (30→10).
 *   lithoClass=2 (leem):   kernel=40, extrapolatie 2.8× op GENERAL tabel (60→20). Geen NL
 *                           veldmeting. Prior: 20 Ω·m. Onzekerheid: hoog (±50%).
 *   lithoClass=3 (zand):   kernel=60, gemeten ρ_apparent IJmuiden n=10: ~43 Ω·m,
 *                           Amersfoort n=10: ~52 Ω·m → geo.mean ~47 Ω·m. Prior: 45 Ω·m.
 *   lithoClass=4 (grind):  kernel=150, geen NL veldmeting. Extrapolatie 2.8× op GENERAL
 *                           tabel (300→110). Brede onzekerheid. Prior: 110 Ω·m.
 *                           ⚠ ONVERGELIJKT — verifieer bij eerste grind-locatie.
 *   lithoClass=5 (veen):   kernel=400 (mineraal/droog). NL laagveen verzadigd: 5–20 Ω·m.
 *                           Geo.mean literatuur ~10 Ω·m (CROW Handboek Aarding, TNO 2004).
 *                           Haarlemmermeer CPT (veen, GWT 0.6 m): geoMeanRatio=0.907 ✓.
 *                           Prior: 10 Ω·m.
 */

import { lithoClassToRhoWet } from '@/lib/calculations';

/**
 * Corrected rhoWet priors for NL saturated conditions, keyed by lithoClass.
 *
 * These replace the kernel WET-table values. The kernel WET-table is calibrated
 * for international/dry references; NL saturated conditions are consistently lower
 * by ~2.8× (Fase 0 empirical, 2026-06).
 *
 * Do NOT use to compensate for BRO misclassification errors (Boskoop/Haarlem).
 * These values assume the lithoClass from BRO is CORRECT.
 */
export const NL_RHO_WET_PRIOR: Partial<Record<number, number>> = {
  1: 10,  // klei verzadigd: NL mariene klei 8–15 Ω·m (NEN 60364-5-54 Annex B); extrapolatie 2.8× van GENERAL 30
  2: 20,  // leem verzadigd: extrapolatie 2.8× van GENERAL 60; geen NL veldmeting (onzekerheid ±50%)
  3: 45,  // zand verzadigd: geo.mean IJmuiden ~43 + Amersfoort ~52 = ~47 Ω·m (n=20); kernel 60
  4: 110, // grind verzadigd: extrapolatie 2.8× van GENERAL 300 → 107 ≈ 110; ⚠ ONVERGELIJKT
  5: 10,  // veen verzadigd: NL laagveen 5–20 Ω·m, geo.mean ~10 Ω·m (CROW/TNO); kernel 400 is mineraal/droog
};

/**
 * Resolves the two-layer rhoWet value for a given lithoClass.
 *
 * Priority:
 *   1. NL_RHO_WET_PRIOR — empirical NL priors (Fase 0, 2026-06)
 *   2. lithoClassToRhoWet — kernel WET table (international reference)
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
