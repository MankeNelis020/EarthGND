/**
 * Smoke checks for veldmeting depth-curve seeding.
 * Run: npx tsx scripts/tests/depth-curve-check.ts
 */
import {
  buildInitialCurve,
  formatDepthLabel,
  resolveInitialCurve,
} from '../../lib/meting/depth-curve';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function depths(rows: { depth: number }[]) {
  return rows.map(r => r.depth);
}

// 20 m → 7 fields −3…−21
assert(depths(buildInitialCurve(20)).join(',') === '3,6,9,12,15,18,21', '20m → 3…21');
assert(buildInitialCurve(20).length === 7, '20m → 7 rows');

// Exact multiple
assert(depths(buildInitialCurve(18)).join(',') === '3,6,9,12,15,18', '18m → 3…18');

// Small depth still starts at 3
assert(depths(buildInitialCurve(2)).join(',') === '3', '2m → [3]');

assert(formatDepthLabel(21) === '−21 m', 'label');

// Empty saved + expected → seed
assert(
  resolveInitialCurve([], 20).length === 7,
  'empty saved seeds from expected',
);

// Measured Ra preserved
assert(
  resolveInitialCurve([{ depth: 3, ra: 12 }], 20).length === 1,
  'measured curve not overwritten',
);

// Empty single draft expanded
assert(
  resolveInitialCurve([{ depth: 3, ra: 0 }], 20).length === 7,
  'empty draft expanded to expected',
);

console.log('depth-curve-check: ok');
