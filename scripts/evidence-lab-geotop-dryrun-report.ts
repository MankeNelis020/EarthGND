/**
 * Detailed GeoTOP backfill dry-run — no DB writes.
 * Reports insert/skip reasons for confirmed metingen with coordinates.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fetchGeoTopColumn } from '@/lib/geotop';
import { wgs84ToRd } from '@/lib/rd';
import {
  buildGeotopValidationRows,
  columnToDepthSamples,
  clusterSites,
} from '@/lib/evidence-lab';

function loadEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      env[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch { /* optional */ }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  console.log('SOIL_KNOWLEDGE_ACTIVE=', env.SOIL_KNOWLEDGE_ACTIVE ?? 'unset');
  console.log('EMPIRICAL_WEIGHT=', env.EMPIRICAL_WEIGHT ?? 'unset');
  console.log('DRY RUN — no writes');

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Check migration tables
  const mig = await db.from('geotop_validation').select('id', { count: 'exact', head: true });
  console.log('geotop_validation:', mig.error?.message ?? `ok count=${mig.count}`);

  const { data: metingen, error } = await db
    .from('pendiepte_metingen')
    .select('id, lat, lon, straatnaam, huisnummer, woonplaats, postcode, depth_curve, electrode_no, elektrode_diameter_mm, status')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const all = metingen ?? [];
  const withCoords = all.filter(m => m.lat != null && m.lon != null);
  const withoutCoords = all.filter(m => m.lat == null || m.lon == null);

  const points = withCoords.map(m => ({
    id: m.id as string,
    lat: Number(m.lat),
    lon: Number(m.lon),
    siteKey:
      [m.straatnaam, m.huisnummer, m.woonplaats, m.postcode].filter(Boolean).join(', ') || null,
  }));
  const clusters = clusterSites(points);
  const clusterOf = new Map<string, string>();
  for (const c of clusters) for (const id of c.memberIds) clusterOf.set(id, c.clusterId);

  const reasons: Record<string, number> = {
    would_insert_rows: 0,
    would_insert_metingen: 0,
    skip_no_coords: withoutCoords.length,
    skip_empty_curve: 0,
    skip_geotop_unavailable: 0,
    skip_no_validation_rows: 0,
  };
  const samples: unknown[] = [];
  const siteInsertCounts = new Map<string, number>();

  // Cap network calls for dry-run report; process all with coords but stop GeoTOP after N if needed
  const targets = withCoords;
  console.log(`metingen total=${all.length} with_coords=${withCoords.length} unique_sites=${clusters.length}`);

  for (const m of targets) {
    const lat = Number(m.lat);
    const lon = Number(m.lon);
    const curve =
      (m.depth_curve as
        | { depth_m?: number; depth?: number; ra_ohm?: number; R?: number }[]
        | null) ?? [];
    const normalized = curve
      .map(p => ({
        depth_m: Number(p.depth_m ?? p.depth),
        ra_ohm: Number(p.ra_ohm ?? p.ra ?? p.R),
      }))
      .filter(p => p.depth_m > 0 && p.ra_ohm > 0);

    if (!normalized.length) {
      reasons.skip_empty_curve += 1;
      continue;
    }

    const { rdX, rdY } = wgs84ToRd(lat, lon);
    let result;
    try {
      result = await fetchGeoTopColumn(rdX, rdY);
    } catch {
      reasons.skip_geotop_unavailable += 1;
      continue;
    }
    if (!result.available) {
      reasons.skip_geotop_unavailable += 1;
      continue;
    }

    const columnSamples = columnToDepthSamples(result.maaiveldNAP, result.column);
    const siteClusterId = clusterOf.get(m.id as string) ?? `meting:${m.id}`;
    const rows = buildGeotopValidationRows({
      metingId: m.id as string,
      electrodeNo: m.electrode_no != null ? Number(m.electrode_no) : null,
      lat,
      lon,
      siteClusterId,
      depthCurve: normalized,
      geotopColumn: columnSamples,
      electrodeDiameterMm:
        m.elektrode_diameter_mm != null ? Number(m.elektrode_diameter_mm) : 14,
    });

    if (!rows.length) {
      reasons.skip_no_validation_rows += 1;
      continue;
    }

    reasons.would_insert_rows += rows.length;
    reasons.would_insert_metingen += 1;
    siteInsertCounts.set(siteClusterId, (siteInsertCounts.get(siteClusterId) ?? 0) + rows.length);

    if (samples.length < 5) {
      samples.push({
        metingId: m.id,
        status: m.status,
        site: [m.straatnaam, m.huisnummer, m.woonplaats].filter(Boolean).join(', '),
        siteClusterId,
        electrodeNo: m.electrode_no,
        depthPoints: normalized.length,
        validationRows: rows.length,
        example: {
          depthM: rows[0]!.depthM,
          R: rows[0]!.measuredRaOhm,
          rho: Math.round(rows[0]!.empiricalRhoOhmM * 10) / 10,
          geotop: rows[0]!.geotopRawLithology,
          earthgndClass: rows[0]!.earthgndLithoClass,
          agree: rows[0]!.agreementScore,
        },
      });
    }
  }

  console.log('\n=== DRY RUN SUMMARY ===');
  console.log(JSON.stringify(reasons, null, 2));
  console.log('unique_sites_with_inserts=', siteInsertCounts.size);
  console.log('sample_would_insert=', JSON.stringify(samples, null, 2));
  console.log('\nProduction prediction behavior remains unchanged');
  console.log('MIGRATION_TABLES_PRESENT=', !mig.error);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
