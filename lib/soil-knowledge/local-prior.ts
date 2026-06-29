/**
 * L4 — lokale observaties via nabijgelegen confirmed veldmetingen.
 *
 * Twee signalen:
 *   1. ρ_wet (IDW over natte ρ_apparent uit dieptecurve)
 *   2. Pendiepte-hint (IDW over installed_depth, exact adres heeft voorrang)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { haversineMeters, latLonBoundingBox } from './geo';
import { analyzeDepthCurve } from './reverse-engine';
import type { LevelEstimate } from './types';

export const L4_MAX_RADIUS_M = 500;
export const L4_MIN_N_RHO = 1;
export const L4_MIN_N_DEPTH = 1;

export type LocalDepthSource = 'exact_address' | 'proximity' | 'none';

export interface NearbyMetingRow {
  id: string;
  lat: number;
  lon: number;
  postcode: string | null;
  huisnummer: string | null;
  installed_depth: number | null;
  depth_curve: Array<{ depth: number; ra: number }> | null;
  field_gw_depth: number | null;
  bro_gw_depth: number | null;
}

export interface LocalDepthHint {
  medianDepthM:   number;
  n:              number;
  maxDistanceM: number;
  source:         LocalDepthSource;
  /** IDW-gewogen betrouwbaarheid 0–1 */
  confidence:     number;
}

export interface LocalKnowledgeResult {
  l4:         LevelEstimate | null;
  depthHint:  LocalDepthHint | null;
}

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function normalizePostcode(pc: string | null | undefined): string | null {
  if (!pc) return null;
  return pc.replace(/\s/g, '').toUpperCase();
}

function normalizeHuisnummer(hn: string | number | null | undefined): string | null {
  if (hn == null) return null;
  return String(hn).trim() || null;
}

/** IDW-gewicht: 1 / d² met minimum 10 m om singulariteit te vermijden. */
function idwWeight(distanceM: number, addressBoost = 1): number {
  const d = Math.max(distanceM, 10);
  return addressBoost / (d * d);
}

function medianWetRho(m: NearbyMetingRow): number | null {
  const curve = m.depth_curve ?? [];
  if (!curve.length) return null;
  const gw = m.field_gw_depth ?? m.bro_gw_depth ?? 2.0;
  const analyzed = analyzeDepthCurve(curve, gw);
  const wet = analyzed.filter(p => p.zone === 'wet').map(p => p.rhoApparent).filter(r => r > 0);
  if (!wet.length) {
    const last = analyzed[analyzed.length - 1]?.rhoApparent;
    return last && last > 0 ? last : null;
  }
  wet.sort((a, b) => a - b);
  return wet[Math.floor(wet.length / 2)];
}

export async function fetchNearbyMetingen(
  lat: number,
  lon: number,
  radiusM = L4_MAX_RADIUS_M,
  supabaseClient?: SupabaseClient,
): Promise<Array<NearbyMetingRow & { distanceM: number }>> {
  const supabase = supabaseClient ?? getServiceClient();
  const box = latLonBoundingBox(lat, lon, radiusM);

  const { data, error } = await supabase
    .from('pendiepte_metingen')
    .select('id, lat, lon, postcode, huisnummer, installed_depth, depth_curve, field_gw_depth, bro_gw_depth')
    .eq('status', 'confirmed')
    .neq('measurement_quality', 'onbruikbaar')
    .gte('lat', box.minLat)
    .lte('lat', box.maxLat)
    .gte('lon', box.minLon)
    .lte('lon', box.maxLon);

  if (error || !data) return [];

  return data
    .filter((r): r is NearbyMetingRow & { lat: number; lon: number } =>
      r.lat != null && r.lon != null && r.installed_depth != null && r.installed_depth > 0,
    )
    .map(r => ({
      ...(r as NearbyMetingRow),
      distanceM: haversineMeters(lat, lon, r.lat, r.lon),
    }))
    .filter(r => r.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export function buildLocalKnowledge(
  nearby: Array<NearbyMetingRow & { distanceM: number }>,
  queryPostcode?: string | null,
  queryHuisnummer?: string | null,
): LocalKnowledgeResult {
  if (!nearby.length) return { l4: null, depthHint: null };

  const qPc = normalizePostcode(queryPostcode);
  const qHn = normalizeHuisnummer(queryHuisnummer);

  // ── L4 ρ via IDW ──────────────────────────────────────────────────────────
  let rhoWeightSum = 0;
  let rhoWeightedSum = 0;
  let rhoCount = 0;
  const rhoValues: number[] = [];

  for (const m of nearby) {
    const rho = medianWetRho(m);
    if (rho == null || rho <= 0) continue;

    const isExact =
      qPc && qHn &&
      normalizePostcode(m.postcode) === qPc &&
      normalizeHuisnummer(m.huisnummer) === qHn;

    const w = idwWeight(m.distanceM, isExact ? 50 : 1);
    rhoWeightSum += w;
    rhoWeightedSum += w * rho;
    rhoValues.push(rho);
    rhoCount++;
  }

  let l4: LevelEstimate | null = null;
  if (rhoCount >= L4_MIN_N_RHO && rhoWeightSum > 0) {
    const mu = rhoWeightedSum / rhoWeightSum;
    const mean = rhoValues.reduce((s, v) => s + v, 0) / rhoValues.length;
    const variance = rhoValues.reduce((s, v) => s + (v - mean) ** 2, 0) / rhoValues.length;
    const sigma = Math.max(Math.sqrt(variance), 5);
    l4 = { mu, sigma, n: rhoWeightSum };
  }

  // ── Diepte-hint via IDW ───────────────────────────────────────────────────
  let depthWeightSum = 0;
  let depthWeightedSum = 0;
  let depthCount = 0;
  let maxDist = 0;
  let exactCount = 0;

  for (const m of nearby) {
    const depth = m.installed_depth;
    if (depth == null || depth <= 0) continue;

    const isExact =
      qPc && qHn &&
      normalizePostcode(m.postcode) === qPc &&
      normalizeHuisnummer(m.huisnummer) === qHn;

    if (isExact) exactCount++;

    const w = idwWeight(m.distanceM, isExact ? 100 : 1);
    depthWeightSum += w;
    depthWeightedSum += w * depth;
    depthCount++;
    maxDist = Math.max(maxDist, m.distanceM);
  }

  let depthHint: LocalDepthHint | null = null;
  if (depthCount >= L4_MIN_N_DEPTH && depthWeightSum > 0) {
    const source: LocalDepthSource =
      exactCount > 0 ? 'exact_address' :
      maxDist <= L4_MAX_RADIUS_M ? 'proximity' : 'none';

    depthHint = {
      medianDepthM:   Math.round((depthWeightedSum / depthWeightSum) * 10) / 10,
      n:              depthCount,
      maxDistanceM:   Math.round(maxDist),
      source,
      confidence:     Math.min(1, depthWeightSum / (depthWeightSum + 0.001)),
    };
  }

  return { l4, depthHint };
}

export async function resolveLocalKnowledge(
  lat: number,
  lon: number,
  postcode?: string | null,
  huisnummer?: string | null,
  supabaseClient?: SupabaseClient,
): Promise<LocalKnowledgeResult> {
  const nearby = await fetchNearbyMetingen(lat, lon, L4_MAX_RADIUS_M, supabaseClient);
  return buildLocalKnowledge(nearby, postcode, huisnummer);
}
