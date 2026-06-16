/**
 * GeoTOP OPeNDAP verification script.
 *
 * Usage:  npm run verify:geotop
 *
 * What it checks:
 *  1. Liveness — Hyrax endpoint is reachable.
 *  2. Index calculation — Zoetermeer xi/yi match expected values.
 *  3. DDS schema — dimension sizes match geotop-config.ts constants.
 *  4. Smoke test — 313-value lithok column with plausible codes.
 *  5. fetchGeoTopSamples() — returns valid BroDepthSample[] for bro.ts.
 *  6. fetchGeoTopColumn() — rich result with maaiveld, column, rho, confidence.
 *  7. Out-of-bounds — RD (0,0) returns { available: false }.
 *  8. Second location — Amsterdam centrum.
 *
 * Run after any GeoTOP model update to catch version-bump breaks early.
 */

import { GEOTOP } from '../lib/geotop-config';
import { rdToGeotopIndex, fetchGeoTopSamples, fetchGeoTopColumn, isGeoTopAvailable } from '../lib/geotop';

const ZOETERMEER = { rdX: 92500, rdY: 453000, label: 'Zoetermeer centrum' };
const AMSTERDAM_CENTRUM = { rdX: 121000, rdY: 487000, label: 'Amsterdam centrum' };
const OUTSIDE_NL = { rdX: 0, rdY: 0, label: 'buiten NL (RD 0,0)' };

let exitCode = 0;
function ok(msg: string) { console.log(`  ✓  ${msg}`); }
function fail(msg: string) { console.error(`  ✗  ${msg}`); exitCode = 1; }
function section(title: string) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`); }

async function main() {
  // 1. Liveness
  section('1. Liveness check');
  const live = await isGeoTopAvailable();
  live ? ok('Hyrax endpoint reachable') : fail('Hyrax endpoint unreachable — remaining tests may fail');

  // 2. Index calculation
  section('2. RD → grid index');
  const zoIdx = rdToGeotopIndex(ZOETERMEER.rdX, ZOETERMEER.rdY);
  if (!zoIdx) {
    fail('Zoetermeer should be inside coverage');
  } else {
    zoIdx.xi === 789 ? ok('xi=789 (expected 789)') : fail(`xi=${zoIdx.xi} (expected 789)`);
    zoIdx.yi === 1145 ? ok('yi=1145 (expected 1145)') : fail(`yi=${zoIdx.yi} (expected 1145)`);
  }
  const outIdx = rdToGeotopIndex(OUTSIDE_NL.rdX, OUTSIDE_NL.rdY);
  outIdx ? fail('RD (0,0) should be out of bounds') : ok('RD (0,0) correctly returns null');

  // 3. DDS schema check
  section('3. DDS dimension-range verification');
  try {
    const ddsUrl = `${GEOTOP.endpoint}.dds`;
    const res = await fetch(ddsUrl, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      fail(`DDS fetch failed: HTTP ${res.status}`);
    } else {
      const dds = await res.text();
      const xMatch = dds.match(/x\s*=\s*(\d+)/i);
      const yMatch = dds.match(/y\s*=\s*(\d+)/i);
      const zMatch = dds.match(/z\s*=\s*(\d+)/i);
      const xSize = xMatch ? parseInt(xMatch[1]) : null;
      const ySize = yMatch ? parseInt(yMatch[1]) : null;
      const zSize = zMatch ? parseInt(zMatch[1]) : null;
      console.log(`     DDS reports: x=${xSize}, y=${ySize}, z=${zSize}`);
      console.log(`     Config has:  xMax=${GEOTOP.xMax} (size ${GEOTOP.xMax + 1}), yMax=${GEOTOP.yMax} (size ${GEOTOP.yMax + 1}), zMax=${GEOTOP.zMax} (size ${GEOTOP.zMax + 1})`);
      if (xSize !== null && xSize !== GEOTOP.xMax + 1) fail(`x mismatch: ${xSize} vs ${GEOTOP.xMax + 1}`);
      else if (xSize !== null) ok(`x dimension matches (${xSize})`);
      if (ySize !== null && ySize !== GEOTOP.yMax + 1) fail(`y mismatch: ${ySize} vs ${GEOTOP.yMax + 1}`);
      else if (ySize !== null) ok(`y dimension matches (${ySize})`);
      if (zSize !== null && zSize !== GEOTOP.zMax + 1) fail(`z mismatch: ${zSize} vs ${GEOTOP.zMax + 1}`);
      else if (zSize !== null) ok(`z dimension matches (${zSize})`);
    }
  } catch (e) { fail(`DDS fetch threw: ${e}`); }

  // 4. Smoke test — raw ASCII
  section(`4. Smoke test — raw lithok column for ${ZOETERMEER.label}`);
  try {
    const url = `${GEOTOP.endpoint}.ascii?lithok%5B789%5D%5B1145%5D%5B0%3A${GEOTOP.zMax}%5D`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      fail(`HTTP ${res.status}`);
    } else {
      const text = await res.text();
      const dataLine = text.split('\n').find((l) => l.startsWith('lithok.lithok'));
      if (!dataLine) {
        fail('No lithok data line in response');
      } else {
        const values = dataLine.split(', ').slice(1).map(Number);
        console.log(`     Column length: ${values.length} (expected ${GEOTOP.zMax + 1})`);
        values.length === GEOTOP.zMax + 1
          ? ok(`Column length correct (${values.length})`)
          : fail(`Wrong length (${values.length})`);
        const validValues = values.filter((v) => v !== -127);
        console.log(`     Valid voxels: ${validValues.length}, fill: ${values.length - validValues.length}`);
        validValues.length > 0 ? ok(`${validValues.length} valid voxels`) : fail('All values are fill');
        const uniqueClasses = Array.from(new Set(validValues)).sort((a, b) => a - b);
        console.log(`     Lithoklassen: [${uniqueClasses.join(', ')}]`);
        const plausible = uniqueClasses.every((v) => v >= 0 && v <= 9);
        plausible ? ok('All codes within 0–9') : fail(`Unexpected codes: [${uniqueClasses.filter((v) => v < 0 || v > 9).join(', ')}]`);
      }
    }
  } catch (e) { fail(`Smoke test threw: ${e}`); }

  // 5. fetchGeoTopSamples
  section(`5. fetchGeoTopSamples() — ${ZOETERMEER.label}`);
  const zSamples = await fetchGeoTopSamples(ZOETERMEER.rdX, ZOETERMEER.rdY);
  if (!zSamples) {
    fail('fetchGeoTopSamples returned null');
  } else {
    ok(`Got ${zSamples.length} samples`);
    const depths = zSamples.map((s) => Math.abs(s.depth));
    JSON.stringify(depths) === JSON.stringify([1, 3, 5, 10, 20])
      ? ok('Depths are [1,3,5,10,20] m')
      : fail(`Unexpected depths: [${depths.join(', ')}]`);
    const allValid = zSamples.every((s) => s.rho > 0 && s.lithoClass >= 1 && s.lithoClass <= 5);
    allValid ? ok('All samples have valid lithoClass (1–5) and rho > 0') : fail('Invalid sample data');
    console.log('     Profile:');
    for (const s of zSamples) {
      console.log(`       depth=${s.depth} m  lithoClass=${s.lithoClass}  ρ=${s.rho} Ω·m`);
    }
  }

  // 6. fetchGeoTopColumn
  section(`6. fetchGeoTopColumn() — ${ZOETERMEER.label}`);
  const zCol = await fetchGeoTopColumn(ZOETERMEER.rdX, ZOETERMEER.rdY);
  if (!zCol.available) {
    fail(`available=false: ${zCol.reason}`);
  } else {
    ok(`maaiveld=${zCol.maaiveldNAP} m NAP`);
    ok(`${zCol.column.length} voxels`);
    ok(`ρ low=${zCol.rho.low.toFixed(0)} / typical=${zCol.rho.typical.toFixed(0)} / high=${zCol.rho.high.toFixed(0)} Ω·m`);
    ok(`confidence: ${zCol.confidence}`);
    ok(`source: "${zCol.source}"`);
    console.log('     Top 6 voxels:');
    for (const v of zCol.column.slice(0, 6)) {
      const k = v.kans != null ? ` kans=${v.kans}%` : '';
      console.log(`       NAP ${v.topNAP.toFixed(1)}→${v.botNAP.toFixed(1)}  klas=${v.lithok}  ${v.soil}${k}`);
    }
  }

  // 7. Out-of-bounds
  section('7. Out-of-bounds → available: false');
  const outCol = await fetchGeoTopColumn(OUTSIDE_NL.rdX, OUTSIDE_NL.rdY);
  !outCol.available
    ? ok(`available:false ("${outCol.reason}")`)
    : fail('Expected available:false for out-of-bounds');

  // 8. Amsterdam
  section(`8. fetchGeoTopSamples() — ${AMSTERDAM_CENTRUM.label}`);
  const aSamples = await fetchGeoTopSamples(AMSTERDAM_CENTRUM.rdX, AMSTERDAM_CENTRUM.rdY);
  if (!aSamples) {
    fail('fetchGeoTopSamples returned null for Amsterdam');
  } else {
    ok(`Got ${aSamples.length} samples`);
    console.log('     Profile:');
    for (const s of aSamples) {
      console.log(`       depth=${s.depth} m  lithoClass=${s.lithoClass}  ρ=${s.rho} Ω·m`);
    }
  }

  section('Done');
  if (exitCode !== 0) {
    console.error('\n  One or more checks FAILED — see above.\n');
  } else {
    console.log('\n  All checks passed.\n');
  }
  process.exit(exitCode);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
