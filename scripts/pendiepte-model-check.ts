import assert from 'node:assert/strict';
import {
  calcDiepte,
  calcLayeredRhoEffective,
  LITHO_CLASS_TO_RHO,
  lithoClassToRhoWet,
} from '../lib/calculations';
import { runKernel } from '../lib/pipeline/kernel-adapter';
import { resolveRhoWet } from '../lib/pipeline/rho-priors';
import { calcLayeredRhoEffectiveNl } from '../lib/pipeline/effective-rho';

function approx(actual: number, expected: number, tolerance: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

// Veen ρ-truth (docs/contracts.md §C): GENERAL legacy ≠ kernel-WET ≠ NL prior
assert.equal(LITHO_CLASS_TO_RHO[5], 2000, 'GENERAL single-layer veen (legacy fallback, not production ρ)');
assert.equal(lithoClassToRhoWet(5), 20, 'Kernel WET veen — used in calcLayeredRhoEffective');
assert.equal(resolveRhoWet(5, 2000), 10, 'NL_RHO_WET_PRIOR[5] — current two-layer production path');

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
  electrodeDiameterMm: 14,
});

// Without soilSamples, resolveRhoWet(5) uses NL_RHO_WET_PRIOR[5] = 10 (not kernel table 20)
assert.equal(
  broPeat.rhoWet,
  10,
  'No soilSamples → resolveRhoWet path → NL_RHO_WET_PRIOR[5] = 10 (see contracts.md §C)',
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

const layeredRhoNl = calcLayeredRhoEffectiveNl(
  [
    { depth: 1, lithoClass: 3 },
    { depth: 3, lithoClass: 5 },
  ],
  1,
  4,
);
assert.ok(
  layeredRhoNl < layeredRho,
  `NL adapter wet prior (10) should yield lower effective rho than kernel-WET (20), got NL=${layeredRhoNl} kernel=${layeredRho}`,
);

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

const layeredPeat = runKernel({
  rho: 125,
  targetResistance: 10,
  groundwaterDepth: 1,
  ph: 6.5,
  electrodeType: 'pen',
  lintBurialDepth: 0.8,
  lintConductorDiameter: 0.01,
  lithoClass: 3,
  hasBroProfile: true,
  dataSource: 'bhrgt',
  soilSamples: [
    { depth: 1, lithoClass: 3 },
    { depth: 3, lithoClass: 5 },
  ],
  electrodeDiameterMm: 14,
});
assert.equal(layeredPeat.rhoModel, 'layered-nl', 'soilSamples → NL layered adapter path');
assert.ok(
  layeredPeat.effectiveRho != null && layeredPeat.effectiveRho < layeredRho,
  `adapter effectiveRho (${layeredPeat.effectiveRho}) should beat kernel-WET layered (${layeredRho})`,
);
assert.ok(
  (layeredPeat.scenarios.gemiddeld as { depth: number }).depth < sandOverPeat.depth,
  'NL layered adapter should require less depth than kernel calcDiepte with same soilSamples',
);

// Parallel policy — no auto-advice on depth alone (Orkaden-class: deep single pen, SDS, full BRO)
const orkadenSamples = Array.from({ length: 20 }, (_, i) => ({ depth: i + 1, lithoClass: 3 }));
const orkadenInput = {
  rho: 74,
  targetResistance: 2,
  groundwaterDepth: 1.86,
  ph: 6.5,
  electrodeType: 'pen' as const,
  lintBurialDepth: 0.8,
  lintConductorDiameter: 0.01,
  lithoClass: 3,
  hasBroProfile: true,
  drijfmethode: 'sds' as const,
  soilSamples: orkadenSamples,
  dataSource: 'cpt' as const,
  electrodeDiameterMm: 14,
};
const orkaden = runKernel(orkadenInput);
assert.equal(orkaden.parallelAdvice, null, 'Full BRO + achievable SDS depth → no mandatory parallel');
assert.ok(
  (orkaden.scenarios.gemiddeld as { depth: number }).depth >= 30,
  'Deep target R should still yield Dwight depth without parallel',
);
const orkadenOpt = runKernel({ ...orkadenInput, parallelRequested: true });
assert.ok(orkadenOpt.parallelOption != null, 'parallelRequested → parallelOption populated');
assert.equal(
  orkadenOpt.parallelOption?.reason,
  'requested',
  'Optional parallel uses requested reason, not driveability',
);

console.log('Pendiepte model checks passed');
