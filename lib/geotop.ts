/**
 * GeoTOP voxelmodel (TNO/BRO) — national 100×100×0.5m subsurface model.
 *
 * The BRO uitgifte REST service (publiek.broservices.nl/sr/geotop) was returning
 * 503 "all pods are down" on 2026-06-14. This module tries the endpoint and
 * returns null gracefully when unavailable. No user-facing error is surfaced —
 * the caller falls through to the next source in the chain.
 *
 * URL format is based on the BRO API pattern observed on working services (CPT,
 * BHR-GT). Verify response shape against the GeoTOP openapi.json when the
 * service is restored.
 */

import { lithoClassToRho } from './calculations';
import type { BroDepthSample } from './bro';

const BRO_DEPTHS = [1, 3, 5, 10, 20];

const GEOTOP_BASE = 'https://publiek.broservices.nl/sr/geotop/v1';

// GeoTOP lithoClass codes align with the LITHO_CLASS_TO_RHO table already used.
// The model outputs 1–6; 6 = anthropogenic fill, treated as sand (3) here.
function geotopLithoToClass(raw: number): number {
  if (raw === 6) return 3; // anthropogenic fill → sand as neutral assumption
  if (raw >= 1 && raw <= 5) return raw;
  return 3;
}

/**
 * Check whether the GeoTOP service is currently responding.
 * Used on app startup / before registering GeoTOP in the fetch chain.
 */
export async function isGeoTopAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${GEOTOP_BASE}/voxelmodels`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch GeoTOP voxel data at an RD New coordinate.
 *
 * Returns null when the service is unavailable (503/timeout) or the coordinate
 * falls outside the GeoTOP coverage area (~85 % of NL; gaps in some polders and
 * the Wadden Sea).
 */
export async function fetchGeoTopSamples(rdX: number, rdY: number): Promise<BroDepthSample[] | null> {
  try {
    // Primary candidate URL: characteristics query by RD coordinate.
    // Alternative: /voxelmodels/GeoTOP/characteristicsresults?x=...&y=...
    // Verify against openapi.json once service is restored.
    const url = `${GEOTOP_BASE}/voxelmodels/GeoTOP/characteristics?x=${Math.round(rdX)}&y=${Math.round(rdY)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();

    // Defensive: handle several plausible response shapes.
    //   Shape A: { voxels: [{ depth: number, lithoClass: number }] }
    //   Shape B: { characteristics: [{ depth: number, lithoClass: number }] }
    //   Shape C: [{ depth: number, lithoClass: number }]
    type RawVoxel = { depth?: number; lithoClass?: number; lithoclass?: number };
    const rawList: RawVoxel[] =
      Array.isArray(data) ? data :
      Array.isArray(data?.voxels) ? data.voxels :
      Array.isArray(data?.characteristics) ? data.characteristics :
      [];

    if (!rawList.length) return null;

    // Normalise: depth is positive metres below surface in GeoTOP convention.
    const voxels = rawList
      .map((v) => ({
        depth: Math.abs(v.depth ?? 0),
        lithoClass: geotopLithoToClass(v.lithoClass ?? v.lithoclass ?? 3),
      }))
      .filter((v) => v.depth > 0)
      .sort((a, b) => a.depth - b.depth);

    if (!voxels.length) return null;

    const lastVoxel = voxels[voxels.length - 1];
    return BRO_DEPTHS.map((targetDepth) => {
      // Nearest voxel at or above the target depth; extrapolate deepest for >model range.
      const voxel =
        voxels.find((v) => v.depth >= targetDepth) ??
        lastVoxel;
      return {
        depth: -targetDepth,
        lithoClass: voxel.lithoClass,
        rho: lithoClassToRho(voxel.lithoClass),
      };
    });
  } catch {
    // 503, timeout, parse error — fall through to next source
    return null;
  }
}
