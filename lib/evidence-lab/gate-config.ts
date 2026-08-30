/**
 * Poort 2 / 3 / 4 gate thresholds — single config file.
 * Conservative defaults. Never auto-approve production.
 */

export const LITHO_LABELS: Record<number, string> = {
  1: 'Klei',
  2: 'Leem',
  3: 'Zand',
  4: 'Grind',
  5: 'Veen',
};

export const EARTHGND_LITHO_CLASSES = [1, 2, 3, 4, 5] as const;
export type EarthGndLithoClass = (typeof EARTHGND_LITHO_CLASSES)[number];

/** Site clustering radius (metres) for unique physical sites. */
export const SITE_CLUSTER_RADIUS_M = 75;

export const POORT2 = {
  /** geoMean(toolDepth / fieldDepth) per location — from gate:depth */
  maxGeoMeanDepthFactor: 1.3,
  minLocations: 1,
} as const;

/**
 * Poort 3 OOS — leave-one-site-out.
 * Marked REQUIRES REVIEW where a hard default cannot be statistically justified yet.
 */
export const POORT3 = {
  minUniqueSitesPerLithology: 3,
  minSoftN: 5,
  minGeotopConfidence: 0.5,
  maxMedianRelativeErrorPct: 35,
  minAgreementScore: 0.55,
  minHeldOutSites: 3,
  /** Empirical MAE must not exceed theory MAE by more than this relative fraction. */
  maxDeteriorationVsTheory: 0.05,
  /** REQUIRES REVIEW — placeholder until calibration study; used for display only. */
  minUncertaintyCalibration: null as number | null,
  statusRequiresReviewLabel: 'REQUIRES REVIEW',
} as const;

export const POORT4 = {
  defaultMode: 'shadow' as const,
  defaultEnabled: false,
  defaultEmpiricalCapPercent: 30,
  grindAlwaysBlocked: true,
} as const;

export type GateStatusLevel =
  | 'INSUFFICIENT_DATA'
  | 'BUILDING_EVIDENCE'
  | 'VALIDATING'
  | 'PASSING_TECHNICAL_GATES'
  | 'ELIGIBLE_FOR_HUMAN_REVIEW';

export type CurrentGateLabel =
  | 'POORT_2_SHADOW'
  | 'POORT_3_OOS_VALIDATION'
  | 'ELIGIBLE_FOR_REVIEW'
  | 'POORT_4_CONTROLLED_ACTIVATION'
  | 'PRODUCTION_APPROVED';
