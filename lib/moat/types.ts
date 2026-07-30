/** Moat spine types — aligned with supabase/moat_data_spine_migration.sql */

export type PredictionAccuracyCategory =
  | 'excellent'
  | 'good'
  | 'acceptable'
  | 'miss'
  | 'unknown';

export type PricingTier = 'premium' | 'standard' | 'pilot' | 'building';

export interface MoatIndex {
  total_measurements: number;
  active_months: number;
  avg_confidence: number;
  confidence_spread: number;
  avg_empirical_percentage: number;
  /** @deprecated use moat_claim_ready_regions — regions with confidence ≥ 0.70 */
  strong_regions: number;
  moat_claim_ready_regions?: number;
  region_count: number;
  volume_component: number;
  confidence_component: number;
  empirical_component: number;
  moat_index_0_to_10: number;
  target_measurements: number;
  refreshed_at: string;
}

export interface GeographicStrengthRow {
  region_name: string;
  soil_type: string;
  measurement_count: number;
  linked_prediction_count: number;
  confidence_score: number | null;
  avg_prediction_error_pct: number | null;
  empirical_percentage: number | null;
  first_try_success_rate: number | null;
  readiness_status: string;
  pricing_tier: PricingTier | string;
  /** Legacy DB flag: moat claim ready (≥0.70), NOT product availability */
  sellable: boolean;
}

export interface GrowthTrajectoryRow {
  month: string;
  measurements_this_month: number;
  cumulative_total: number;
  status: string;
}

export interface MoatSpinePayload {
  moatIndex: MoatIndex | null;
  geographic: GeographicStrengthRow[];
  growth: GrowthTrajectoryRow[];
  signatureCount: number;
  board: import('./derive').MoatBoardView | null;
  notes: string[];
  queriedAt: string;
}
