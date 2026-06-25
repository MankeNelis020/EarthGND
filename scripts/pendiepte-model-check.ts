import assert from 'node:assert/strict';
import {
  calcDiepte,
  calcLayeredRhoEffective,
  lithoClassToRhoWet,
} from '../lib/calculations';
import { runKernel } from '../lib/pipeline/kernel-adapter';

function approx(actual: number, expected: number, tolerance: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

assert.equal(
  lithoClassToRhoWet(5),
  20,
  'Saturated Dutch lowland peat prior must stay at 20 Ω·m',
);

const broPeat = runKernel({
  rho: 2000,
  targetResistance: 10,
  groundwaterDepth: 1,
  ph: 6.5,
  electrodeType: 'pen',
  lintBurialDepth: 0.8,
  lintConductorDiameter: 0.01,
  lithoClass: 5,
  hasBroProfile: true,
  dataSource: 'bhrgt',
});

assert.equal(
  broPeat.rhoWet,
  20,
  'BRO profile must not reuse dominantRho as saturated rhoWet',
);
assert.ok(
  (broPeat.scenarios.gunstig as { depth: number }).depth < 5,
  'Wet peat profile should not require extreme depth for 10 Ω in favourable GHG',
);

const layeredRho = calcLayeredRhoEffective(
  [
    { depth: 1, lithoClass: 3 }, // sand cap
    { depth: 3, lithoClass: 5 }, // wet peat below
  ],
  1,
  4,
);

assert.ok(layeredRho > 20 && layeredRho < 300, `Layered rho should reflect both sand and peat, got ${layeredRho}`);

const sandOnly = calcDiepte({
  rho: 125,
  targetResistance: 10,
  gwDepth: 1,
  soilSamples: [{ depth: 1, lithoClass: 3 }],
});
const sandOverPeat = calcDiepte({
  rho: 125,
  targetResistance: 10,
  gwDepth: 1,
  soilSamples: [
    { depth: 1, lithoClass: 3 },
    { depth: 3, lithoClass: 5 },
  ],
});

assert.ok(
  sandOverPeat.depth < sandOnly.depth,
  `Wet peat layer should reduce required depth versus sand-only profile (${sandOverPeat.depth} >= ${sandOnly.depth})`,
);
approx(sandOverPeat.achievedResistance, 10, 1, 'Layered profile achieved resistance');

console.log('Pendiepte model checks passed');
