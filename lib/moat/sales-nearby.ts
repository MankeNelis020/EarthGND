/**
 * Sales battlefield: nearby confirmed outcomes + region moat summary.
 * Wider default radius than L4 (2 km vs 500 m) — pitch context, not ρ-prior.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  haversineMeters,
  latLonBoundingBox,
} from '@/lib/soil-knowledge/geo';
import {
  PRODUCT_AVAILABILITY_LINE,
  dataClaimTierLabel,
  moatReadinessFromConfidence,
  moatReadinessLabel,
} from '@/lib/moat/labels';
import { moatRegionForCoords } from '@/lib/moat/regions';

export const SALES_NEARBY_RADIUS_M = 2000;

export type SalesNearbyOutcome = {
  id: string;
  distanceM: number;
  lat: number;
  lon: number;
  postcode: string | null;
  huisnummer: string | null;
  straatnaam: string | null;
  woonplaats: string | null;
  installed_depth: number | null;
  predicted_depth_m: number | null;
  depth_error_percent: number | null;
  prediction_accuracy_category: string | null;
  hasPredictionLink: boolean;
  regional_cluster_id: string | null;
};

export type SalesRegionSummary = {
  region_name: string;
  soil_type: string;
  measurement_count: number;
  confidence_score: number | null;
  moat_status: string;
  data_claim_tier: string;
  avg_prediction_error_pct: number | null;
  product_note: string;
};

export type SalesPitchSummary = {
  n: number;
  withAccuracy: number;
  medianInstalledDepth: number | null;
  shareNotMiss: number | null;
  pitchLine: string;
};

type MetingRow = {
  id: string;
  lat: number | null;
  lon: number | null;
  postcode: string | null;
  huisnummer: string | null;
  straatnaam: string | null;
  woonplaats: string | null;
  installed_depth: number | null;
  predicted_depth_m: number | null;
  depth_error_percent: number | null;
  prediction_accuracy_category: string | null;
  regional_cluster_id: string | null;
  status: string | null;
  measurement_quality: string | null;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function fetchSalesNearbyOutcomes(
  lat: number,
  lon: number,
  radiusM: number,
  db: SupabaseClient,
): Promise<SalesNearbyOutcome[]> {
  const box = latLonBoundingBox(lat, lon, radiusM);

  const { data, error } = await db
    .from('pendiepte_metingen')
    .select(`
      id, lat, lon, postcode, huisnummer, straatnaam, woonplaats,
      installed_depth, predicted_depth_m, depth_error_percent,
      prediction_accuracy_category, regional_cluster_id, status,
      measurement_quality
    `)
    .or('status.eq.confirmed,installed_depth.not.is.null')
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .gte('lat', box.minLat)
    .lte('lat', box.maxLat)
    .gte('lon', box.minLon)
    .lte('lon', box.maxLon)
    .limit(120);

  if (error || !data) return [];

  return (data as MetingRow[])
    .filter(r => r.measurement_quality !== 'onbruikbaar')
    .filter(r => r.lat != null && r.lon != null)
    .map(r => {
      const distanceM = haversineMeters(lat, lon, r.lat as number, r.lon as number);
      return {
        id: r.id,
        distanceM,
        lat: r.lat as number,
        lon: r.lon as number,
        postcode: r.postcode,
        huisnummer: r.huisnummer,
        straatnaam: r.straatnaam,
        woonplaats: r.woonplaats,
        installed_depth: r.installed_depth,
        predicted_depth_m: r.predicted_depth_m,
        depth_error_percent: r.depth_error_percent,
        prediction_accuracy_category: r.prediction_accuracy_category,
        hasPredictionLink: r.predicted_depth_m != null,
        regional_cluster_id: r.regional_cluster_id,
      } satisfies SalesNearbyOutcome;
    })
    .filter(r => r.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function lookupRegionSummary(
  regionName: string,
  db: SupabaseClient,
): Promise<SalesRegionSummary | null> {
  const name = regionName || 'overig-NL';

  const { data } = await db
    .from('regional_signatures')
    .select('*')
    .eq('region_name', name)
    .order('confidence_score', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      region_name: name,
      soil_type: 'mixed',
      measurement_count: 0,
      confidence_score: null,
      moat_status: moatReadinessLabel('thin'),
      data_claim_tier: dataClaimTierLabel('building'),
      avg_prediction_error_pct: null,
      product_note: PRODUCT_AVAILABILITY_LINE,
    };
  }

  const conf = data.confidence_score as number | null;
  const level = moatReadinessFromConfidence(conf);
  return {
    region_name: data.region_name as string,
    soil_type: (data.soil_type as string) ?? 'mixed',
    measurement_count: Number(data.measurement_count ?? 0),
    confidence_score: conf,
    moat_status: moatReadinessLabel(level),
    data_claim_tier: dataClaimTierLabel(data.recommended_pricing_tier as string),
    avg_prediction_error_pct:
      data.avg_prediction_error_pct == null
        ? null
        : Number(data.avg_prediction_error_pct),
    product_note: PRODUCT_AVAILABILITY_LINE,
  };
}

export function summarizeNearbyForPitch(
  nearby: SalesNearbyOutcome[],
): SalesPitchSummary {
  const n = nearby.length;
  const withCat = nearby.filter(r => r.prediction_accuracy_category != null);
  const notMiss = withCat.filter(r => r.prediction_accuracy_category !== 'miss');
  const depths = nearby
    .map(r => r.installed_depth)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 0);
  const shareNotMiss =
    withCat.length === 0 ? null : Math.round((notMiss.length / withCat.length) * 100);
  const medianDepth = median(depths);

  let pitchLine: string;
  if (n === 0) {
    pitchLine =
      'Geen lokale outcomes in deze radius. Reken wél door (product beschikbaar); claim pas na veldmeting.';
  } else if (shareNotMiss != null && shareNotMiss >= 70 && withCat.length >= 3) {
    pitchLine = `${n} lokale outcomes · ${shareNotMiss}% geen miss` +
      (medianDepth != null ? ` · mediaan diepte ${medianDepth.toFixed(1)} m` : '') +
      ' — bruikbaar als lokale data-ondersteuning.';
  } else if (withCat.length > 0) {
    pitchLine = `${n} lokale outcomes gevonden` +
      (shareNotMiss != null ? ` (${shareNotMiss}% geen miss)` : '') +
      '. Gebruik als context; data-claim nog voorzichtig.';
  } else {
    pitchLine = `${n} lokale outcomes zonder prediction-link. Dieptes bruikbaar als context; accuracy nog niet claimbaar.`;
  }

  return {
    n,
    withAccuracy: withCat.length,
    medianInstalledDepth: medianDepth,
    shareNotMiss,
    pitchLine,
  };
}

/** Convenience: resolve named region for a point (for callers). */
export function salesRegionNameForCoords(lat: number, lon: number): string {
  return moatRegionForCoords(lat, lon);
}
