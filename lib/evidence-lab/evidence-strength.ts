/**
 * Transparent multi-component evidence strength (0–100 each).
 * No unexplained proprietary single score without breakdown.
 */

export type EvidenceStrengthComponents = {
  sampleStrength: number;
  siteIndependence: number;
  geographicCoverage: number;
  measurementQuality: number;
  geotopConfidence: number;
  oosPerformance: number;
  uncertainty: number;
};

export type EvidenceStrengthResult = {
  components: EvidenceStrengthComponents;
  /** Equal-weight mean of available components; nulls excluded. */
  combined: number | null;
  weights: Record<keyof EvidenceStrengthComponents, number>;
  formula: string;
};

const EQUAL = 1 / 7;

export const EVIDENCE_STRENGTH_WEIGHTS: Record<keyof EvidenceStrengthComponents, number> = {
  sampleStrength: EQUAL,
  siteIndependence: EQUAL,
  geographicCoverage: EQUAL,
  measurementQuality: EQUAL,
  geotopConfidence: EQUAL,
  oosPerformance: EQUAL,
  uncertainty: EQUAL,
};

function clamp01to100(x: number): number {
  return Math.max(0, Math.min(100, x));
}

export function scoreSampleStrength(softN: number, minSoftN: number): number {
  if (minSoftN <= 0) return softN > 0 ? 100 : 0;
  return clamp01to100((softN / minSoftN) * 100);
}

export function scoreSiteIndependence(uniqueSites: number, rawObs: number): number {
  if (rawObs <= 0) return 0;
  return clamp01to100((uniqueSites / rawObs) * 100);
}

export function scoreGeographicCoverage(regionCount: number, targetRegions = 5): number {
  return clamp01to100((regionCount / targetRegions) * 100);
}

export function scoreMeasurementQuality(highShare01: number): number {
  return clamp01to100(highShare01 * 100);
}

export function scoreGeotopConfidence(meanProb01: number): number {
  return clamp01to100(meanProb01 * 100);
}

/** 100 when empirical MAPE ≤ theory MAPE; declines with deterioration. */
export function scoreOosPerformance(
  theoryMape: number | null,
  empiricalMape: number | null,
): number {
  if (theoryMape == null || empiricalMape == null) return 0;
  if (theoryMape <= 0) return empiricalMape <= 0 ? 100 : 0;
  const ratio = empiricalMape / theoryMape;
  // ratio 1 → 100; ratio 1.05 → ~50; worse → lower
  return clamp01to100(100 * Math.max(0, 2 - ratio));
}

/** Higher when posterior σ is tighter relative to theory σ. */
export function scoreUncertainty(theorySigma: number, posteriorSigma: number | null): number {
  if (!(theorySigma > 0) || posteriorSigma == null || !(posteriorSigma > 0)) return 0;
  return clamp01to100((theorySigma / posteriorSigma) * 50);
}

export function combineEvidenceStrength(
  components: EvidenceStrengthComponents,
  weights: Record<keyof EvidenceStrengthComponents, number> = EVIDENCE_STRENGTH_WEIGHTS,
): EvidenceStrengthResult {
  let num = 0;
  let den = 0;
  for (const key of Object.keys(components) as (keyof EvidenceStrengthComponents)[]) {
    const w = weights[key] ?? 0;
    const v = components[key];
    if (w > 0 && Number.isFinite(v)) {
      num += w * v;
      den += w;
    }
  }
  return {
    components,
    combined: den > 0 ? num / den : null,
    weights,
    formula:
      'combined = Σ(w_i × component_i) / Σ w_i  (gelijke gewichten tenzij anders geconfigureerd)',
  };
}
