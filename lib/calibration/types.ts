/**
 * Shared types for the EarthGND calibration pipeline.
 *
 * Architecture constraint: calibration sits BEFORE the kernel.
 * The kernel (lib/calculations.ts + kernel-adapter.ts) is NEVER modified.
 * The calibration-adapter takes BRO data, applies corrections from the
 * calibration_store, and produces adjusted ValidatedDiepteInput for the kernel.
 */

// ─── Field data (source of truth: Excel → JSON) ───────────────────────────────

export interface DepthMeasurement {
  depthM: number;    // rod tip depth below surface, m
  rMeasured: number; // measured resistance, Ω
}

export interface FieldLocation {
  id: string;
  label: string;
  address: string;             // NL address for PDOK geocoding
  groundwaterDepthM: number;   // observed on-site GWT, m below surface
  soilDescription: string;     // e.g. "veen/klei" — from PDF/monteur notes
  depthCurve: DepthMeasurement[];
}

// ─── Counterfactual output (Fase 0) ──────────────────────────────────────────

export interface PointReport {
  depthM: number;
  rMeasured: number;
  rhoApparentMeasured: number; // back-computed: R_meas × 2πL / ln(4L/d) — code formula
  rhoEffBro: number;           // calcRhoEffective(rhoDry_bro, rhoWet_bro, gw, L)
  rPredictedBro: number;       // forward Dwight with BRO rhoEff
  logResidual: number;         // ln(ρ_apparent_measured) − ln(ρ_eff_bro)
  ratio: number;               // ρ_apparent_measured / ρ_eff_bro
}

export interface BiasStats {
  meanLogResidual: number;     // mean of logResidual across depth curve
  stddevLogResidual: number;
  meanRatio: number;           // geometric mean of ratio
  n: number;
}

export interface LocationReport {
  id: string;
  label: string;
  address: string;
  geocoded: { lat: number; lon: number } | null;
  bro: {
    source: string;
    dataSource?: string;
    dominantRho: number;
    groundwaterDepth: number | null;
    boringAfstand?: number;
    dominantLithoClass: number;
    rhoDryBro: number;
    rhoWetBro: number;
  } | null;
  fieldGwDepthM: number;
  points: PointReport[];
  bias: BiasStats | null;
}

export interface Fase0Report {
  generatedAt: string;
  note: string;
  locations: LocationReport[];
}

// ─── Calibration store (Fase 5) ───────────────────────────────────────────────

export interface LithoClassCalibration {
  /** Multiplicative correction on rhoWet: rhoWet_calibrated = rhoWet_bro × kWet */
  kWet: number;
  /** Multiplicative correction on rhoDry: rhoDry_calibrated = rhoDry_bro × kDry */
  kDry: number;
  /** Number of measurement points used to derive this correction */
  nPoints: number;
  /** Standard deviation of log-residuals (quality indicator) */
  stddevLogResidual: number;
  /** Sources: location IDs that contributed */
  sources: string[];
}

export interface CalibrationStore {
  version: number;
  generatedAt: string;
  /** Keyed by lithoClass (1–6) */
  byLithoClass: Record<number, LithoClassCalibration>;
}
