/**
 * Dry-run / live GeoTOP validation backfill (idempotent upsert).
 * Usage:
 *   DRY_RUN=1 npx tsx --tsconfig tsconfig.json scripts/evidence-lab-geotop-backfill.ts
 *   DRY_RUN=0 npx tsx --tsconfig tsconfig.json scripts/evidence-lab-geotop-backfill.ts
 */

import { createClient } from '@supabase/supabase-js';
import { fetchGeoTopColumn } from '@/lib/geotop';
import { wgs84ToRd } from '@/lib/rd';
import {
  buildGeotopValidationRows,
  columnToDepthSamples,
  clusterSites,
} from '@/lib/evidence-lab';

async function main() {
  const dryRun = process.env.DRY_RUN !== '0';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase env');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: metingen, error } = await db
    .from('pendiepte_metingen')
    .select('id, lat, lon, adres, plaats, depth_curve, electrode_no, elektrode_diameter_mm')
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .limit(200);

  if (error) throw error;

  const points = (metingen ?? []).map(m => ({
    id: m.id as string,
    lat: Number(m.lat),
    lon: Number(m.lon),
    siteKey: [m.adres, m.plaats].filter(Boolean).join(', ') || null,
  }));
  const clusters = clusterSites(points);
  const clusterOf = new Map<string, string>();
  for (const c of clusters) for (const id of c.memberIds) clusterOf.set(id, c.clusterId);

  let written = 0;
  let skipped = 0;

  for (const m of metingen ?? []) {
    const lat = Number(m.lat);
    const lon = Number(m.lon);
    const curve =
      (m.depth_curve as
        | { depth_m?: number; depth?: number; ra_ohm?: number; R?: number }[]
        | null) ?? [];
    const normalized = curve
      .map(p => ({
        depth_m: Number(p.depth_m ?? p.depth),
        ra_ohm: Number(p.ra_ohm ?? p.R),
      }))
      .filter(p => p.depth_m > 0 && p.ra_ohm > 0);

    if (!normalized.length) {
      skipped += 1;
      continue;
    }

    const { rdX, rdY } = wgs84ToRd(lat, lon);
    const result = await fetchGeoTopColumn(rdX, rdY);
    if (!result.available) {
      skipped += 1;
      continue;
    }

    const columnSamples = columnToDepthSamples(result.maaiveldNAP, result.column);
    const rows = buildGeotopValidationRows({
      metingId: m.id as string,
      electrodeNo: m.electrode_no != null ? Number(m.electrode_no) : null,
      lat,
      lon,
      siteClusterId: clusterOf.get(m.id as string) ?? `meting:${m.id}`,
      depthCurve: normalized,
      geotopColumn: columnSamples,
      electrodeDiameterMm:
        m.elektrode_diameter_mm != null ? Number(m.elektrode_diameter_mm) : 14,
    });

    if (!rows.length) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      written += rows.length;
      continue;
    }

    const payload = rows.map(r => ({
      meting_id: r.metingId,
      electrode_no: r.electrodeNo,
      lat: r.lat,
      lon: r.lon,
      site_cluster_id: r.siteClusterId,
      depth_m: r.depthM,
      measured_ra_ohm: r.measuredRaOhm,
      empirical_rho_ohm_m: r.empiricalRhoOhmM,
      geotop_raw_lithology: r.geotopRawLithology,
      geotop_klas: r.geotopKlas,
      geotop_probability: r.geotopProbability,
      earthgnd_litho_class: r.earthgndLithoClass,
      earthgnd_class_dist: r.earthgndClassDist,
      theoretical_mu: r.theoreticalMu,
      theoretical_sigma: r.theoreticalSigma,
      absolute_error: r.absoluteError,
      relative_error_pct: r.relativeErrorPct,
      agreement_score: r.agreementScore,
      source_version: r.sourceVersion,
      exclusion_reason: r.exclusionReason,
    }));

    const { error: upErr } = await db.from('geotop_validation').upsert(payload, {
      onConflict: 'meting_id,electrode_no,depth_m,source_version',
    });
    if (upErr) throw upErr;
    written += payload.length;
  }

  console.log(JSON.stringify({ dryRun, written, skipped, metingen: metingen?.length ?? 0 }, null, 2));
  console.log('Production prediction behavior remains unchanged');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
