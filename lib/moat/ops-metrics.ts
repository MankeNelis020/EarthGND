/**
 * Ops funnel + weekly health from pendiepte_metingen + regional_signatures.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dataClaimTierLabel,
  moatReadinessFromConfidence,
  moatReadinessLabel,
} from './labels';

export interface OpsFunnel {
  totalOutcomes: number;
  withPredictionLink: number;
  withDepthError: number;
  knowledgeProcessed: number;
  qualityGoed: number;
  qualityTwijfel: number;
  qualityOnbruikbaar: number;
  outliers: number;
}

export interface OpsWeekRow {
  weekStart: string;
  count: number;
}

export interface OpsRegionHealth {
  region_name: string;
  soil_type: string;
  measurement_count: number;
  linked_prediction_count: number;
  confidence_score: number | null;
  moat_status: string;
  data_claim_tier: string;
  avg_prediction_error_pct: number | null;
  updated_at: string | null;
}

export async function fetchOpsFunnel(db: SupabaseClient): Promise<OpsFunnel> {
  const { data, error } = await db
    .from('pendiepte_metingen')
    .select(`
      id, status, installed_depth, predicted_depth_m, depth_error_m,
      knowledge_processed_at, measurement_quality, is_outlier
    `)
    .or('status.eq.confirmed,installed_depth.not.is.null');

  if (error || !data) {
    return {
      totalOutcomes: 0,
      withPredictionLink: 0,
      withDepthError: 0,
      knowledgeProcessed: 0,
      qualityGoed: 0,
      qualityTwijfel: 0,
      qualityOnbruikbaar: 0,
      outliers: 0,
    };
  }

  return {
    totalOutcomes: data.length,
    withPredictionLink: data.filter(r => r.predicted_depth_m != null).length,
    withDepthError: data.filter(r => r.depth_error_m != null).length,
    knowledgeProcessed: data.filter(r => r.knowledge_processed_at != null).length,
    qualityGoed: data.filter(r => r.measurement_quality === 'goed' || r.measurement_quality == null).length,
    qualityTwijfel: data.filter(r => r.measurement_quality === 'twijfelachtig').length,
    qualityOnbruikbaar: data.filter(r => r.measurement_quality === 'onbruikbaar').length,
    outliers: data.filter(r => r.is_outlier === true).length,
  };
}

export async function fetchOpsWeekly(db: SupabaseClient, weeks = 12): Promise<OpsWeekRow[]> {
  const { data } = await db
    .from('pendiepte_metingen')
    .select('confirmed_at, submitted_at, created_at, status, installed_depth')
    .or('status.eq.confirmed,installed_depth.not.is.null');

  if (!data?.length) return [];

  const buckets = new Map<string, number>();
  for (const row of data) {
    const raw = row.confirmed_at ?? row.submitted_at ?? row.created_at;
    if (!raw) continue;
    const d = new Date(raw);
    // Monday-start ISO week key
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, weeks);
}

export async function fetchOpsRegionHealth(db: SupabaseClient): Promise<OpsRegionHealth[]> {
  const { data } = await db
    .from('regional_signatures')
    .select('*')
    .order('confidence_score', { ascending: false, nullsFirst: false });

  return (data ?? []).map(r => {
    const conf = r.confidence_score as number | null;
    const level = moatReadinessFromConfidence(conf);
    return {
      region_name: r.region_name as string,
      soil_type: r.soil_type as string,
      measurement_count: r.measurement_count as number,
      linked_prediction_count: (r.linked_prediction_count as number) ?? 0,
      confidence_score: conf,
      moat_status: moatReadinessLabel(level),
      data_claim_tier: dataClaimTierLabel(r.recommended_pricing_tier as string),
      avg_prediction_error_pct: r.avg_prediction_error_pct as number | null,
      updated_at: (r.updated_at as string | null) ?? null,
    };
  });
}
