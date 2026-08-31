/**
 * Physical site clustering — electrodes at one address ≠ independent sites.
 */

import { haversineMeters } from '@/lib/soil-knowledge/geo';
import { SITE_CLUSTER_RADIUS_M } from './gate-config';

export type SitePoint = {
  id: string;
  lat: number | null;
  lon: number | null;
  /** Optional stable site key (address / project / meting group). */
  siteKey?: string | null;
};

export type SiteClusterResult = {
  clusterId: string;
  memberIds: string[];
  lat: number | null;
  lon: number | null;
  siteKey: string | null;
};

/**
 * Cluster measurements into unique physical sites.
 * 1. Same non-empty siteKey → same cluster
 * 2. Else points within SITE_CLUSTER_RADIUS_M of a cluster centroid join that cluster
 * 3. Points without coordinates each form singleton clusters (still countable as sites
 *    for global evidence, but excluded from GeoTOP/location validation elsewhere)
 */
export function clusterSites(
  points: SitePoint[],
  radiusM: number = SITE_CLUSTER_RADIUS_M,
): SiteClusterResult[] {
  const byKey = new Map<string, SitePoint[]>();
  const noKey: SitePoint[] = [];

  for (const p of points) {
    const key = p.siteKey?.trim();
    if (key) {
      const list = byKey.get(key) ?? [];
      list.push(p);
      byKey.set(key, list);
    } else {
      noKey.push(p);
    }
  }

  const clusters: SiteClusterResult[] = [];
  let seq = 0;

  for (const [siteKey, members] of Array.from(byKey.entries())) {
    const withCoords = members.filter((m: SitePoint) => m.lat != null && m.lon != null);
    const lat = withCoords.length
      ? withCoords.reduce((s: number, m: SitePoint) => s + (m.lat as number), 0) / withCoords.length
      : null;
    const lon = withCoords.length
      ? withCoords.reduce((s: number, m: SitePoint) => s + (m.lon as number), 0) / withCoords.length
      : null;
    clusters.push({
      clusterId: `key:${siteKey}`,
      memberIds: members.map((m: SitePoint) => m.id),
      lat,
      lon,
      siteKey,
    });
  }

  const geoClusters: { lat: number; lon: number; memberIds: string[] }[] = [];

  for (const p of noKey) {
    if (p.lat == null || p.lon == null) {
      clusters.push({
        clusterId: `nocoord:${p.id}`,
        memberIds: [p.id],
        lat: null,
        lon: null,
        siteKey: null,
      });
      continue;
    }

    let joined = false;
    for (const c of geoClusters) {
      if (haversineMeters(p.lat, p.lon, c.lat, c.lon) <= radiusM) {
        c.memberIds.push(p.id);
        // Running mean centroid
        const n = c.memberIds.length;
        c.lat = c.lat + (p.lat - c.lat) / n;
        c.lon = c.lon + (p.lon - c.lon) / n;
        joined = true;
        break;
      }
    }
    if (!joined) {
      geoClusters.push({ lat: p.lat, lon: p.lon, memberIds: [p.id] });
    }
  }

  for (const c of geoClusters) {
    seq += 1;
    clusters.push({
      clusterId: `geo:${seq}`,
      memberIds: c.memberIds,
      lat: c.lat,
      lon: c.lon,
      siteKey: null,
    });
  }

  return clusters;
}

export function uniqueSiteCount(points: SitePoint[], radiusM?: number): number {
  return clusterSites(points, radiusM).length;
}

/**
 * Soft_n for Lab gate display:
 * soft_n_site = soft_n_raw * min(1, unique_sites / max(1, electrode_or_obs_proxy))
 *
 * When unique sites << raw observations, effective evidence is down-weighted.
 * Documented in docs/evidence-calibration-lab.md — not used to mutate DB soft_n.
 */
export function softNSiteAdjusted(
  softNRaw: number,
  uniqueSites: number,
  observationProxy: number,
): number {
  if (!(softNRaw > 0)) return 0;
  const proxy = Math.max(1, observationProxy);
  const factor = Math.min(1, uniqueSites / proxy);
  return softNRaw * factor;
}
