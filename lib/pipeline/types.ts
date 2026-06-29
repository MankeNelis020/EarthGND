/**
 * Shared types for the reliability pipeline.
 * The kernel (calcDiepte / calcLint) is called through kernel-adapter.ts and stays pure.
 * All pipeline stages communicate through these types.
 */

// ─── Tool & electrode ─────────────────────────────────────────────────────────

export type ToolType      = 'diepte' | 'ohm';
export type ElectrodeType = 'pen' | 'lint';
export type { DriveMethod } from './driveability';

// ─── Raw input (before parse/validate — anything could be string or missing) ──

export interface RawDiepteInput {
  rho?:                   unknown;
  targetResistance?:      unknown;
  groundwaterDepth?:      unknown;
  ph?:                    unknown;
  postcode?:              string;
  huisnummer?:            string;
  electrodeType?:         unknown;
  lintBurialDepth?:       unknown;
  lintConductorDiameter?: unknown;
  lithoClass?:            unknown;
  rhoDryOverride?:        unknown;
  hasBroProfile?:         unknown;
  drijfmethode?:          unknown;  // DriveMethod
  // Depth-varying soil samples from BRO (for driveability check)
  soilSamples?:           unknown;  // Array<{depth: number; lithoClass: number}>
  // Source metadata for confidence scoring
  dataSource?:   string;   // 'cpt'|'bhrgt'|'geotop'|'bodemkaart'|'fallback'|'manual'
  boringAfstand?: unknown; // km (distance to nearest measurement)
  boringJaar?:    unknown; // year of measurement
  // Client sends true after user confirmed a heavy-plausibility warning
  confirmed?: boolean;
  /** Optioneel: parallelschakeling op Dwight-diepte uitrekenen (niet auto-adviseren). */
  parallelRequested?: unknown;
}

// ─── Validated/canonicalized input — guaranteed safe for the kernel ───────────

export interface SoilSample {
  depth:      number;  // m from surface
  lithoClass: number;  // 1–5 (EarthGND scale)
}

export interface ValidatedDiepteInput {
  rho:                   number; // > 0
  targetResistance:      number; // > 0
  groundwaterDepth:      number; // >= 0
  ph:                    number; // 0–14
  postcode?:             string;
  huisnummer?:           string;
  electrodeType:         ElectrodeType;
  lintBurialDepth:       number; // default 0.8 m
  lintConductorDiameter: number; // default 0.01 m
  lithoClass?:           number;
  rhoDryOverride?:       number; // > 0 when present
  rhoWetOverride?:       number; // > 0 when present — set by active-prior stage (Poort 3+)
  hasBroProfile:         boolean;
  drijfmethode?:         import('./driveability').DriveMethod;
  soilSamples?:          SoilSample[];
  // Confidence metadata (carried through, not used by kernel)
  dataSource:    DataSource;
  boringAfstand?: number;  // km
  boringJaar?:    number;
  parallelRequested?: boolean;
}

// ─── Data source & confidence ─────────────────────────────────────────────────

export type DataSource = 'cpt' | 'bhrgt' | 'geotop' | 'bodemkaart' | 'manual' | 'fallback';
export type ConfidenceLevel = 'hoog' | 'midden' | 'laag';

export interface SourceConfidence {
  level:     ConfidenceLevel;
  label:     string; // display: "BRO-boring op 180 m" / "Generieke waarde"
  icon:      '✓' | '~' | '⚠';
  showBROBadge: boolean; // true ONLY when data is actually from BRO (not generic/fallback)
}

// ─── Plausibility ─────────────────────────────────────────────────────────────

export type PlausibilitySeverity = 'none' | 'light' | 'heavy';

export interface PlausibilityFlag {
  field:    string;
  value:    number | string;
  message:  string;
  severity: 'light' | 'heavy';
}

export interface PlausibilityResult {
  severity:             PlausibilitySeverity;
  flags:                PlausibilityFlag[];
  confirmationRequired: boolean; // true iff severity === 'heavy' AND !confirmed
}

// ─── Credit reservation ───────────────────────────────────────────────────────

export interface CreditReservation {
  id:         string;
  captured:   boolean;
  released:   boolean;
  capture(): Promise<void>;
  release(): Promise<void>;
}

// ─── Uncertainty band (ρ-axis; orthogonal to GWT seasonal scenarios) ──────────

export interface UncertaintyBand {
  typical:       number; // same as primary kernel result
  low:           number; // optimistic (low ρ → shallower depth / lower R)
  high:          number; // conservative (high ρ → deeper / higher R)
  rhoFactorLow:  number;
  rhoFactorHigh: number;
}

// ─── Error classes ────────────────────────────────────────────────────────────

export type ErrorClass = 'A' | 'B_confirm' | 'D';

export interface PipelineError {
  errorClass:       ErrorClass;
  message:          string;  // user-facing NL
  field?:           string;
  technicalDetail?: string;
}

// ─── Result validation (naad for Flow B) ─────────────────────────────────────

export interface ResultValidation {
  allFinite: boolean;
  // Flow B plugs in here:
  // haalbaarheidsgrensGehaald?: boolean;
  // feasibleDepthReached?: boolean;
}

// ─── Pipeline success shape (extends existing route response shape) ───────────

export interface LocalDepthHintEnrichment {
  medianDepthM:   number;
  n:              number;
  maxDistanceM:   number;
  source:         'exact_address' | 'proximity' | 'none';
  confidence:     number;
}

export interface PipelineEnrichment {
  confidence:        SourceConfidence;
  plausibilityFlags: PlausibilityFlag[];
  warnings:          string[];          // UI-explanation layer — one source of truth
  uncertaintyBand:   UncertaintyBand;
  resultValidation:  ResultValidation;
  rhoWetSource:      'l4_local' | 'l3_regional_agnostic' | 'l3_regional' | 'l2_global' | 'l1_literature';
  localDepthHint?:   LocalDepthHintEnrichment | null;
}

// PipelineResult wraps existing data + enrichment
export type PipelineResult<T> =
  | { ok: true;  data: T; enrichment: PipelineEnrichment; creditsRemaining: number }
  | { ok: false; error: PipelineError; creditsRemaining?: number; confirmationRequired?: true };
