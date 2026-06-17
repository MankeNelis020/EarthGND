/**
 * PROVISIONAL plausibility thresholds — marked provisional, norm-anchored.
 * Review periodically; changing these never touches the kernel math.
 *
 * Norm references:
 *   NEN 1010:2020  — Elektrotechnische installaties laagspanning (aarding ≤ 166 Ω voor RCD)
 *   NEN-EN 62305   — Bliksembeveiliging (Ra ≤ 10 Ω)
 *   NEN-EN 50522   — Aarding krachtstations (typisch ≤ 1 Ω)
 *   NEN 3140:2023  — Bedrijfsvoering laagspanning (veldmeting verplich na installatie)
 */

export const PLAUSIBILITY_THRESHOLDS = {
  // ρ (soil resistivity, Ω·m)
  rhoMin:        1,       // below this is physically implausible (metals ~1e-7)
  rhoMaxLight:   5_000,   // > 5000 Ω·m — light warning (extreme rock/gravel)
  rhoMaxHeavy:   20_000,  // > 20000 Ω·m — confirm (likely data-entry error, e.g. 30.000 i.p.v. 30)

  // Grondwaterstand GHG (m below surface)
  gwMaxLight:    12,      // > 12 m — unusual for NL (median ~1–3 m)
  gwMaxHeavy:    15,      // > 15 m — almost impossible in NL outside dune areas

  // Target resistance Ra (Ω)
  targetMinLight: 0.5,   // < 0.5 Ω — very challenging, only specialist systems; NEN-EN 50522
  targetMaxLight: 500,   // > 500 Ω — above all practical norms (NEN 1010 max is 166 Ω)

  // boring distance (km)
  boringAfstandMedium: 0.250,  // 250 m — confidence drops
  boringAfstandLow:    1.000,  // 1 km — low confidence; soil may differ significantly
} as const;

// Uncertainty band ρ-multipliers per confidence level.
// Low ρ → lower resistance → optimistic (shallower pen or lower R).
// These are additive around the typical result; the kernel is called 3×.
export const UNCERTAINTY_FACTORS: Record<string, { factorLow: number; factorHigh: number }> = {
  hoog:   { factorLow: 0.70, factorHigh: 1.50 }, // CPT <250 m: ±30–50% ρ spread
  midden: { factorLow: 0.50, factorHigh: 2.00 }, // BHR/GeoTOP: factor 2 spread
  laag:   { factorLow: 0.30, factorHigh: 3.00 }, // Generic/fallback: very wide
} as const;

// Distance thresholds used by confidence.ts (km)
export const DISTANCE_THRESHOLDS = PLAUSIBILITY_THRESHOLDS;
