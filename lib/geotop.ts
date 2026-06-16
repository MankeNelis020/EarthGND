/**
 * GeoTOP v1.6.1 (TNO – Geologische Dienst Nederland) via OPeNDAP Hyrax.
 *
 * Endpoint: https://www.dinodata.nl/opendap/hyrax/GeoTOP/geotop.nc
 * Protocol: DAP2 ASCII subset — one HTTP GET per (xi, yi) grid cell.
 * Coverage:  100 × 100 m horizontal, 0.5 m vertical, to 50 m −NAP.
 * Open data — attribution: "TNO – GDN, BRO GeoTOP v1.6.1".
 *
 * Dimension order [x][y][z] confirmed (NOT z,y,x). Smoke-tested 2026-06-16
 * against xi=789, yi=1145 (Zoetermeer); 313-value column returned correctly.
 *
 * Graceful fallback: on timeout / out-of-bounds / all-fill column,
 * fetchGeoTopSamples() returns null so bro.ts falls through to Bodemkaart.
 */

import { lithoClassToRho } from './calculations';
import { GEOTOP } from './geotop-config';
import type { BroDepthSample } from './bro';

// ─── Public result type ───────────────────────────────────────────────────────

type ColumnEntry = {
  topNAP: number;
  botNAP: number;
  lithok: number;
  soil: string;
  kans: number | null;
};

export type GeoTopResult =
  | { available: false; reason: string }
  | {
      available: true;
      source: 'TNO – GDN, BRO GeoTOP v1.6.1';
      maaiveldNAP: number;
      column: ColumnEntry[];
      rho: { low: number; typical: number; high: number };
      confidence: 'hoog' | 'midden' | 'laag';
    };

// ─── Internal helpers ─────────────────────────────────────────────────────────

const FILL = -127; // no-data sentinel in GeoTOP

interface ParsedColumn {
  zValues: number[];
  data: Record<string, number[]>;
}

function parseGeotopAscii(text: string): ParsedColumn | null {
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('Dataset:'));
  const data: Record<string, number[]> = {};
  let zValues: number[] | null = null;

  for (const line of lines) {
    const sep = line.indexOf(', ');
    if (sep === -1) continue;
    const label = line.slice(0, sep);
    const values = line.slice(sep + 2).split(', ').map(Number);

    // Two label forms:
    //   z-map:  "varname.z"
    //   data:   "varname.varname[varname.x=N][varname.y=M]"
    // The data label has brackets; the z-map label does not.
    // We cannot use the last dot-segment because the bracket content
    // also contains dots (e.g. "lithok.x=92500").
    if (!label.includes('[')) {
      // z-map line — all variables share the same z grid
      if (!zValues) zValues = values;
    } else {
      // data line — variable name sits between the first '.' and the first '['
      const afterFirstDot = label.slice(label.indexOf('.') + 1);
      const varName = afterFirstDot.slice(0, afterFirstDot.indexOf('['));
      data[varName] = values;
    }
  }

  if (!zValues || !data['lithok']) return null;
  return { zValues, data };
}

/** Index of the highest z-slice that is NOT fill (= soil at/below maaiveld). */
function findMaaiveldIndex(lithok: number[]): number | null {
  for (let i = lithok.length - 1; i >= 0; i--) {
    if (lithok[i] !== FILL) return i;
  }
  return null;
}

/** Build the percent-encoded URL for one grid cell. */
function buildUrl(xi: number, yi: number): string {
  const idx = `[${xi}][${yi}][0:${GEOTOP.zMax}]`;
  const vars = ['lithok', ...GEOTOP.kansVars.map((n) => `kans_${n}`)];
  const constraint = vars.map((v) => `${v}${idx}`).join(',');
  const encoded = constraint.replace(/\[/g, '%5B').replace(/\]/g, '%5D').replace(/:/g, '%3A');
  return `${GEOTOP.endpoint}.ascii?${encoded}`;
}

/** Fetch and parse a grid cell's column. Returns null on any failure. */
async function fetchParsedColumn(xi: number, yi: number): Promise<{ parsed: ParsedColumn; maaiveldIdx: number } | null> {
  try {
    const res = await fetch(buildUrl(xi, yi), { signal: AbortSignal.timeout(GEOTOP.timeoutMs) });
    if (!res.ok) return null;
    const parsed = parseGeotopAscii(await res.text());
    if (!parsed) return null;
    const maaiveldIdx = findMaaiveldIndex(parsed.data['lithok']);
    if (maaiveldIdx === null) return null;
    return { parsed, maaiveldIdx };
  } catch {
    return null;
  }
}

// ─── ρ helpers ────────────────────────────────────────────────────────────────

function klasToLithoClass(klas: number): number {
  return GEOTOP.klasToLithoClass[klas] ?? 3;
}

function klasToRho(klas: number, isWet: boolean): number {
  const base = GEOTOP.rhoByKlas[klas] ?? 125;
  return isWet ? base * GEOTOP.saturationFactor : base;
}

/** Weighted-mean ρ + p20/p80 confidence band from the kans distribution. */
function computeRhoBand(
  kansMap: Record<number, number>,
  isWet: boolean,
): { low: number; typical: number; high: number } | null {
  const entries = Object.entries(kansMap)
    .map(([k, w]) => ({ rho: klasToRho(Number(k), isWet), weight: w }))
    .filter((e) => e.weight > 0);
  if (!entries.length) return null;

  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;

  const typical = entries.reduce((s, e) => s + (e.weight / total) * e.rho, 0);

  const sorted = [...entries].sort((a, b) => a.rho - b.rho);
  let cum = 0;
  let low = sorted[0].rho;
  let high = sorted[sorted.length - 1].rho;
  for (const { rho, weight } of sorted) {
    const pct = (weight / total) * 100;
    if (cum < 20) low = rho;
    if (cum < 80) high = rho;
    cum += pct;
  }

  return { low, typical, high };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Validate RD coordinates and compute GeoTOP grid indices. */
export function rdToGeotopIndex(rdX: number, rdY: number): { xi: number; yi: number } | null {
  const xi = Math.round((rdX - GEOTOP.xOrigin) / GEOTOP.xStep);
  const yi = Math.round((rdY - GEOTOP.yOrigin) / GEOTOP.yStep);
  if (xi < 0 || xi > GEOTOP.xMax || yi < 0 || yi > GEOTOP.yMax) return null;
  return { xi, yi };
}

/**
 * Rich GeoTOP result for diagnostics, admin dashboards, and future UI.
 *
 * @param gwDepthBelow  GHG (m below maaiveld) for saturation weighting.
 *                      Omit to skip saturation (conservative: treat all as dry).
 */
export async function fetchGeoTopColumn(
  rdX: number,
  rdY: number,
  gwDepthBelow?: number,
): Promise<GeoTopResult> {
  const idx = rdToGeotopIndex(rdX, rdY);
  if (!idx) return { available: false, reason: 'buiten GeoTOP-dekking' };

  const result = await fetchParsedColumn(idx.xi, idx.yi);
  if (!result) return { available: false, reason: 'GeoTOP niet beschikbaar of geen data' };

  const { parsed, maaiveldIdx } = result;
  const { zValues, data } = parsed;
  const lithokArr = data['lithok'];
  const maaiveldNAP = zValues[maaiveldIdx];

  const column: ColumnEntry[] = [];
  const kansBands: Array<{ low: number; typical: number; high: number }> = [];
  let dominantKansSum = 0;
  let dominantKansCount = 0;

  // Collect voxels from maaiveld down ~22 m
  const targetBotNAP = maaiveldNAP - 22;

  for (let i = maaiveldIdx; i >= 0; i--) {
    const centreNAP = zValues[i];
    const topNAP = centreNAP + GEOTOP.zStep / 2;
    const botNAP = centreNAP - GEOTOP.zStep / 2;
    if (botNAP < targetBotNAP) break;
    if (lithokArr[i] === FILL) continue;

    const klas = lithokArr[i];
    const depthBelowSurface = maaiveldNAP - centreNAP;
    const isWet = gwDepthBelow != null && depthBelowSurface > gwDepthBelow;

    const kansMap: Record<number, number> = {};
    let maxKans = 0;
    for (const n of GEOTOP.kansVars) {
      const v = data[`kans_${n}`]?.[i];
      if (v != null && v !== FILL) {
        kansMap[n] = v;
        if (v > maxKans) maxKans = v;
      }
    }

    if (maxKans > 0) {
      dominantKansSum += maxKans;
      dominantKansCount++;
    }

    const band = computeRhoBand(kansMap, isWet);
    if (band) kansBands.push(band);

    column.push({
      topNAP,
      botNAP,
      lithok: klas,
      soil: GEOTOP.klasName[klas] ?? `klas ${klas}`,
      kans: maxKans > 0 ? maxKans : null,
    });
  }

  const rho =
    kansBands.length > 0
      ? {
          low: kansBands.reduce((s, b) => s + b.low, 0) / kansBands.length,
          typical: kansBands.reduce((s, b) => s + b.typical, 0) / kansBands.length,
          high: kansBands.reduce((s, b) => s + b.high, 0) / kansBands.length,
        }
      : { low: 125, typical: 125, high: 125 };

  const meanDominantKans = dominantKansCount > 0 ? dominantKansSum / dominantKansCount : 0;
  const confidence: 'hoog' | 'midden' | 'laag' =
    meanDominantKans >= 60 ? 'hoog' : meanDominantKans >= 35 ? 'midden' : 'laag';

  return {
    available: true,
    source: 'TNO – GDN, BRO GeoTOP v1.6.1',
    maaiveldNAP,
    column,
    rho,
    confidence,
  };
}

/**
 * Backward-compatible entry point for bro.ts.
 * Samples the GeoTOP column at BRO_DEPTHS [1,3,5,10,20] m below maaiveld.
 * Returns null when GeoTOP is unavailable so bro.ts falls through to Bodemkaart.
 */
const BRO_DEPTHS = [1, 3, 5, 10, 20];

export async function fetchGeoTopSamples(rdX: number, rdY: number): Promise<BroDepthSample[] | null> {
  const idx = rdToGeotopIndex(rdX, rdY);
  if (!idx) return null;

  const result = await fetchParsedColumn(idx.xi, idx.yi);
  if (!result) return null;

  const { parsed, maaiveldIdx } = result;
  const { zValues, data } = parsed;
  const lithokArr = data['lithok'];
  const maaiveldNAP = zValues[maaiveldIdx];

  return BRO_DEPTHS.map((targetDepth) => {
    const targetNAP = maaiveldNAP - targetDepth;
    const rawIdx = Math.round((targetNAP - GEOTOP.zOriginNAP) / GEOTOP.zStep);
    const startIdx = Math.max(0, Math.min(maaiveldIdx, rawIdx));

    // Walk downward to find nearest non-fill voxel
    let klas = 3;
    for (let i = startIdx; i >= 0; i--) {
      if (lithokArr[i] !== FILL) { klas = lithokArr[i]; break; }
    }

    const lithoClass = klasToLithoClass(klas);
    return { depth: -targetDepth, lithoClass, rho: lithoClassToRho(lithoClass) };
  });
}

/**
 * Liveness check for the admin pipeline-status dashboard.
 * Fetches a single known-good voxel (Zoetermeer centre) to confirm the Hyrax
 * server is up.
 */
export async function isGeoTopAvailable(): Promise<boolean> {
  try {
    // z index 156 = NAP 28 m (well within the model, known to have data)
    const url = `${GEOTOP.endpoint}.ascii?lithok%5B789%5D%5B1145%5D%5B156%3A156%5D`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return res.ok;
  } catch {
    return false;
  }
}
