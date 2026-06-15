/**
 * Bodemkaart 1:50.000 — national soil-type polygon layer via Supabase PostGIS.
 *
 * This is the last fallback before the manual "default sand" response.
 * Because it lives in the project's own database it is always available,
 * independent of BRO/PDOK uptime.
 *
 * SETUP (one-time): see supabase/bodemkaart_schema.sql.
 * Import the GeoPackage from PDOK into your Supabase database with:
 *
 *   ogr2ogr -f PostgreSQL \
 *     "PG:host=<host> user=postgres password=<pw> dbname=postgres" \
 *     bodemkaart.gpkg bodemkaart_vlakken \
 *     -nln public.bodemkaart \
 *     -nlt MULTIPOLYGON \
 *     -t_srs EPSG:28992 \
 *     -select "bodemcode"
 *
 * GeoPackage download: https://service.pdok.nl/bro/bodemkaart/atom/v1_0/
 *   or https://downloads.pdok.nl/ → search "Bodemkaart 50000"
 */

import { createClient } from '@supabase/supabase-js';
import { lithoClassToRho } from './calculations';
import type { BroDepthSample } from './bro';

const BRO_DEPTHS = [1, 3, 5, 10, 20];

/**
 * Map a Bodemkaart legend unit code to a lithoClass.
 *
 * The Bodemkaart 1:50.000 uses codes like "Hn21", "pVb", "Rn95A", "Zb21".
 * The leading letter(s) indicate the main soil group:
 *   V / pV / kV / zV … = veen (peat)            → 5
 *   R / M / K / E …    = klei (clay/river clay)  → 1
 *   L / Ld / Ln …      = leem (loam)             → 2
 *   G                  = grind (gravel)            → 4
 *   Z / H / Y / S / W / P … = zand (sand)        → 3 (default)
 */
function bodemcodeToLithoClass(code: string): number {
  const c = code.trim().toUpperCase();

  // Veen (peat) — pure and mixed: V, pV, kV, zV, Vk, Vz, AV, etc.
  if (/^(V|[KZPMAB]V|V[KZ])/.test(c)) return 5;

  // Klei (clay) — river clays, marine clays, boulder clay
  // R = rivierklei, M = mariene klei, K = diverse klei, E = eerdgrond-klei
  if (/^(R[DNKP]|M[OMN]|KT|KP|KX|EK|BK|KLEI)/.test(c)) return 1;
  if (c.startsWith('K') && !c.startsWith('KD')) return 1; // KD = kalkrijke duingrond = sand

  // Leem / löss
  if (/^L/.test(c)) return 2;

  // Grind
  if (/^G/.test(c)) return 4;

  // All remaining: zand, humuspodzol, enkeerdgrond, vlakvaaggrond, etc.
  return 3;
}

/**
 * Look up the dominant surface soil type from the Bodemkaart polygon layer
 * at the given RD New coordinate.
 *
 * Returns null if the table doesn't exist yet (not yet imported) or if the
 * coordinate falls on water / outside coverage.
 *
 * Because the Bodemkaart only describes the top ~1.2 m, the same lithoClass
 * is applied to all depths. This is a conservative approximation — the actual
 * subsoil can differ — but is still far better than defaulting to "sand".
 */
// Anon client — public reference data, no user context needed
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export async function fetchBodemkaartSoilType(rdX: number, rdY: number): Promise<BroDepthSample[] | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .rpc('get_bodemkaart_at_point', { rd_x: Math.round(rdX), rd_y: Math.round(rdY) });

    if (error || !data?.length) return null;

    const bodemcode: string = data[0]?.bodemcode;
    if (!bodemcode || bodemcode.toUpperCase() === 'W') return null; // water

    const lithoClass = bodemcodeToLithoClass(bodemcode);
    return BRO_DEPTHS.map((targetDepth) => ({
      depth: -targetDepth,
      lithoClass,
      rho: lithoClassToRho(lithoClass),
    }));
  } catch {
    // Table not yet imported or RPC not yet created → silent skip
    return null;
  }
}
