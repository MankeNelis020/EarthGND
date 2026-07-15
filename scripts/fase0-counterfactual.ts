/**
 * Fase 0 — Counterfactual harness.
 *
 * For each field measurement location, simulates what EarthGND would have
 * predicted if that address were submitted to the tool. Computes residuals
 * between the actual field measurements and the BRO-based kernel prediction.
 *
 * Usage:
 *   npm run calibrate:fase0
 *   npm run calibrate:fase0 -- --cache         (reuse BRO responses from previous run)
 *   npm run calibrate:fase0 -- --out report.json
 *
 * Output: JSON to stdout (or --out file) + human-readable summary to stderr.
 *
 * Architecture constraint: the kernel (lib/calculations.ts) is NEVER modified.
 * This script reads BRO data, builds ValidatedDiepteInput, runs the kernel's
 * forward formula, and computes residuals. It does NOT call runGroundingAssessment
 * (which would deduct credits). Instead it calls the pure kernel functions directly.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { forwardGeocode } from '../lib/geocoding';
import { wgs84ToRd } from '../lib/rd';
import { fetchBroSoilData } from '../lib/bro';
import {
  lithoClassToRhoDry,
  calcRhoEffective,
} from '../lib/calculations';
import { resolveRhoWet } from '../lib/pipeline/rho-priors';
import { FIELD_LOCATIONS } from '../lib/calibration/field-data';
import type { LocationReport, PointReport, BiasStats, Fase0Report } from '../lib/calibration/types';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useCache = args.includes('--cache');
const outIdx   = args.indexOf('--out');
const outFile  = outIdx >= 0 ? args[outIdx + 1] : null;

const CACHE_DIR = '.calibration-cache';

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) { process.stderr.write(msg + '\n'); }
function section(title: string) {
  log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// ─── Dwight helpers (code formula — no −1 term, diameter d=0.014 m) ──────────

const ROD_D = 0.014; // m (matches kernel-adapter.ts ROD_DIAMETER)

/** Forward prediction: given ρ_eff at depth L, what does the code predict R is? */
function forwardDwightR(rhoEff: number, L: number): number {
  return (rhoEff / (2 * Math.PI * L)) * Math.log((4 * L) / ROD_D);
}

/** Inversion: from measured R at depth L, back-compute apparent ρ using code formula. */
function invertToRhoApparent(R: number, L: number): number {
  return (R * 2 * Math.PI * L) / Math.log((4 * L) / ROD_D);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function cacheGet(id: string): ReturnType<typeof fetchBroSoilData> extends Promise<infer T> ? T : never | null {
  const path = `${CACHE_DIR}/${id}.json`;
  if (!useCache || !existsSync(path)) return null as never;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null as never;
  }
}

function cacheSet(id: string, data: unknown) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}/${id}.json`, JSON.stringify(data, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function processLocation(loc: typeof FIELD_LOCATIONS[0]): Promise<LocationReport> {
  log(`\n  ${loc.label} (${loc.address})`);

  // ── Step 1: Geocode ──────────────────────────────────────────────────────
  // Use coords directly if provided (GPS location without street address)
  const geo = loc.coords ?? await forwardGeocode(loc.address);
  if (!geo) {
    log(`  ✗  Geocoding failed`);
    return {
      id: loc.id, label: loc.label, address: loc.address,
      geocoded: null, bro: null, fieldGwDepthM: loc.groundwaterDepthM,
      points: [], bias: null,
    };
  }
  log(`  ✓  Geocoded: lat=${geo.lat.toFixed(5)}, lon=${geo.lon.toFixed(5)}`);

  // ── Step 2: RD conversion ────────────────────────────────────────────────
  const { rdX, rdY } = wgs84ToRd(geo.lat, geo.lon);
  log(`  ✓  RD: x=${rdX.toFixed(0)}, y=${rdY.toFixed(0)}`);

  // ── Step 3: BRO soil data ────────────────────────────────────────────────
  let broResult = cacheGet(loc.id);
  if (broResult) {
    log(`  ✓  BRO: loaded from cache`);
  } else {
    log(`  ·  Fetching BRO...`);
    broResult = await fetchBroSoilData(rdX, rdY, geo.lat, geo.lon);
    cacheSet(loc.id, broResult);
    const broId = broResult.boringId ?? '(geen ID)';
  const broAfstand = broResult.boringAfstand != null ? `${broResult.boringAfstand} km` : 'n/a';
  log(`  ✓  BRO: source=${broResult.source}${broResult.dataSource ? '/' + broResult.dataSource : ''}, id=${broId}, afstand=${broAfstand}, dominantRho=${broResult.dominantRho} Ω·m, gwDepth=${broResult.groundwaterDepth ?? 'n/a'} m`);
  }

  // ── Step 4: Derive lithoClass and two-layer ρ ─────────────────────────────
  // dominantRho was computed as lithoClassToRho(dominantLithoClass).
  // We back-compute dominantLithoClass from the samples by finding the most common.
  const LITHO_FROM_RHO: Record<number, number> = { 30: 1, 60: 2, 125: 3, 300: 4, 2000: 5, 4000: 6 };
  const classCount: Record<number, number> = {};
  for (const s of broResult.samples) {
    classCount[s.lithoClass] = (classCount[s.lithoClass] ?? 0) + 1;
  }
  const dominantLithoClass =
    parseInt(Object.entries(classCount).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? '3');

  // Mirrors kernel-adapter.ts (fixed): resolveRhoWet applies WET table + NL priors.
  // rhoDry uses DRY table directly (same as DiepteCalculator after rhoDryProfile fix).
  const rhoDryBro = lithoClassToRhoDry(dominantLithoClass);
  const rhoWetBro = resolveRhoWet(dominantLithoClass, broResult.dominantRho);

  // GWT: prefer BRO measurement well result; fall back to on-site observation.
  const gwDepthM = broResult.groundwaterDepth ?? loc.groundwaterDepthM;

  log(`  ·  lithoClass=${dominantLithoClass}, rhoDry_bro=${rhoDryBro}, rhoWet_bro=${rhoWetBro}, gw=${gwDepthM} m`);

  // ── Step 5: Compute PointReport for each measurement depth ───────────────
  const points: PointReport[] = [];
  for (const { depthM, rMeasured } of loc.depthCurve) {
    const L = depthM;

    const rhoApparentMeasured = invertToRhoApparent(rMeasured, L);
    const rhoEffBro = calcRhoEffective(rhoDryBro, rhoWetBro, gwDepthM, L);
    const rPredictedBro = forwardDwightR(rhoEffBro, L);
    const logResidual = Math.log(rhoApparentMeasured) - Math.log(rhoEffBro);
    const ratio = rhoApparentMeasured / rhoEffBro;

    points.push({ depthM, rMeasured, rhoApparentMeasured, rhoEffBro, rPredictedBro, logResidual, ratio });

    log(
      `  ·  L=${L}m | R_meas=${rMeasured.toFixed(2)} Ω | R_pred=${rPredictedBro.toFixed(2)} Ω | ` +
      `ρ_app=${rhoApparentMeasured.toFixed(1)} | ρ_bro=${rhoEffBro.toFixed(1)} | ratio=${ratio.toFixed(3)}`,
    );
  }

  // ── Step 6: Bias statistics ───────────────────────────────────────────────
  let bias: BiasStats | null = null;
  if (points.length > 0) {
    const logResiduals = points.map(p => p.logResidual);
    const n = logResiduals.length;
    const mean = logResiduals.reduce((a, b) => a + b, 0) / n;
    const variance = logResiduals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
    const geoMeanRatio = Math.exp(logResiduals.reduce((a, b) => a + b, 0) / n);
    bias = { meanLogResidual: mean, stddevLogResidual: Math.sqrt(variance), meanRatio: geoMeanRatio, n };
    log(`  ✓  Bias: meanLogResidual=${mean.toFixed(3)}, geoMeanRatio=${geoMeanRatio.toFixed(4)}, n=${n}`);
  }

  return {
    id: loc.id,
    label: loc.label,
    address: loc.address,
    geocoded: { lat: geo.lat, lon: geo.lon },
    bro: {
      source: broResult.source,
      dataSource: broResult.dataSource,
      dominantRho: broResult.dominantRho,
      groundwaterDepth: broResult.groundwaterDepth ?? null,
      boringAfstand: broResult.boringAfstand,
      boringId: broResult.boringId,
      dominantLithoClass,
      rhoDryBro,
      rhoWetBro,
    },
    fieldGwDepthM: loc.groundwaterDepthM,
    points,
    bias,
  };
}

async function main() {
  section('Fase 0 — Counterfactual harness');
  log(`  ${FIELD_LOCATIONS.length} locations, cache=${useCache}`);

  const locations: LocationReport[] = [];
  for (const loc of FIELD_LOCATIONS) {
    const report = await processLocation(loc);
    locations.push(report);
  }

  // ─── Summary table ────────────────────────────────────────────────────────
  section('Summary — multiplicative correction factors needed');
  log('  ID                    | lithoClass | ρ_BRO  | geoMeanRatio | correction_needed');
  log('  ' + '─'.repeat(75));
  for (const r of locations) {
    if (!r.bro || !r.bias) {
      log(`  ${r.id.padEnd(22)}| (failed)`);
      continue;
    }
    const correction = (1 / r.bias.meanRatio).toFixed(3);
    log(
      `  ${r.id.padEnd(22)}| ${String(r.bro.dominantLithoClass).padEnd(10)} | ` +
      `${String(r.bro.dominantRho).padEnd(7)}| ${r.bias.meanRatio.toFixed(4).padEnd(13)}| ÷ ${correction}`,
    );
  }
  log('');
  log('  Interpretation:');
  log('    geoMeanRatio < 1.0 → measured ρ < BRO prediction → code OVERESTIMATES resistance');
  log('    geoMeanRatio > 1.0 → measured ρ > BRO prediction → code UNDERESTIMATES resistance');
  log('');
  log('  Note: Residuals include both lithoClass ρ-table error and ~14% Dwight formula');
  log('  mismatch (code omits the −1 term vs PDF section B). Do NOT fix the kernel');
  log('  formula — let calibration absorb both effects (architectural constraint).');

  // ─── JSON output ──────────────────────────────────────────────────────────
  const report: Fase0Report = {
    generatedAt: new Date().toISOString(),
    note:
      'Fase 0 counterfactual: BRO prediction vs field measurement residuals. ' +
      'Field data from lib/calibration/field-data.ts (EarthGND-veldmetingen.xlsx, 2026-06-26).',
    locations,
  };

  const json = JSON.stringify(report, null, 2);

  if (outFile) {
    writeFileSync(outFile, json);
    log(`\n  Report written to: ${outFile}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main().catch((e) => { log(`Fatal: ${e}`); process.exit(1); });
