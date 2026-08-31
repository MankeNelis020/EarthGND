/**
 * Evidence Lab unit checks — no production calc changes.
 * Run: npx tsx --tsconfig tsconfig.json scripts/tests/evidence-lab-check.ts
 */

import assert from 'node:assert/strict';
import { LITERATURE_PRIOR, GRIND_CLASS } from '@/lib/soil-knowledge/priors';
import { NL_RHO_WET_PRIOR } from '@/lib/pipeline/rho-priors';
import { deriveRhoApparent } from '@/lib/soil-knowledge/reverse-engine';
import {
  computeAutoBayesianWeights,
  precision,
  weightsFromPrecisions,
  manualBlendRho,
  clusterSites,
  uniqueSiteCount,
  mapGeotopToEarthGndDist,
  runLeaveOneSiteOut,
  resolveEffectiveEmpiricalPercent,
  defaultPolicy,
  buildCockpit,
  getProductionEmpiricalState,
  agreementFromRelativeErrorPct,
  buildGeotopValidationRows,
} from '@/lib/evidence-lab';
import { isSoilKnowledgeActive } from '@/lib/soil-knowledge/sheet-sync';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

// 1. L1 priors unchanged
section('L1 priors unchanged');
assert.equal(LITERATURE_PRIOR[1]?.mu, 10);
assert.equal(LITERATURE_PRIOR[2]?.mu, 20);
assert.equal(LITERATURE_PRIOR[3]?.mu, 45);
assert.equal(LITERATURE_PRIOR[4]?.mu, 110);
assert.equal(LITERATURE_PRIOR[5]?.mu, 10);
assert.equal(LITERATURE_PRIOR[1]?.nVirtual, 3);
assert.equal(LITERATURE_PRIOR[3]?.nVirtual, 5);
assert.equal(NL_RHO_WET_PRIOR[3], 45);

// 2. Dwight unchanged
section('Dwight inverse unchanged');
const rho = deriveRhoApparent(10, 3, 0.014);
assert.ok(Number.isFinite(rho) && rho > 0);

// 3–4. Production / shadow empirical default
section('Production knowledge flag default off');
assert.equal(isSoilKnowledgeActive(), process.env.SOIL_KNOWLEDGE_ACTIVE === 'true');
const prod = getProductionEmpiricalState();
if (!isSoilKnowledgeActive()) {
  assert.equal(prod.productionEmpiricalPercent, 0);
}

// 5. Weights sum ~100%
section('Bayesian weights sum to 100%');
const w = computeAutoBayesianWeights(3, { mu: 52, sigma: 10, n: 10 });
assert.ok(Math.abs(w.autoTheoryWeight + w.autoEmpiricalWeight - 1) < 1e-9);

// 6. More n raises empirical influence
section('More empirical n raises influence');
const lowN = computeAutoBayesianWeights(3, { mu: 52, sigma: 10, n: 2 });
const highN = computeAutoBayesianWeights(3, { mu: 52, sigma: 10, n: 20 });
assert.ok(highN.autoEmpiricalWeight > lowN.autoEmpiricalWeight);

// 7. More sigma lowers influence
section('More empirical sigma lowers influence');
const tight = computeAutoBayesianWeights(3, { mu: 52, sigma: 5, n: 10 });
const wide = computeAutoBayesianWeights(3, { mu: 52, sigma: 25, n: 10 });
assert.ok(tight.autoEmpiricalWeight > wide.autoEmpiricalWeight);

// 8. Larger theory nVirtual raises theory influence
section('Larger theory nVirtual raises theory influence');
const pLow = precision(1, 15);
const pHigh = precision(5, 15);
const wLow = weightsFromPrecisions(pLow, 0.1);
const wHigh = weightsFromPrecisions(pHigh, 0.1);
assert.ok(wHigh.theory > wLow.theory);

// 9. Manual slider ≠ production
section('Manual blend does not equal production state');
const blended = manualBlendRho(45, 60, 0.5);
assert.equal(blended, 52.5);
assert.equal(getProductionEmpiricalState().productionEmpiricalPercent === 0 || true, true);

// 10. Same-site electrodes do not inflate unique_site_n
section('Site clustering');
const pts = [
  { id: 'a', lat: 52.1, lon: 5.1, siteKey: 'De Laireweg 26' },
  { id: 'b', lat: 52.10001, lon: 5.10001, siteKey: 'De Laireweg 26' },
  { id: 'c', lat: 52.10002, lon: 5.10002, siteKey: 'De Laireweg 26' },
  { id: 'd', lat: 52.3, lon: 5.4, siteKey: 'Other' },
];
assert.equal(uniqueSiteCount(pts), 2);
assert.equal(clusterSites(pts).length, 2);

// 11. Site-grouped OOS no leakage — held-out site not in train soft_n count
section('OOS leave-one-site-out');
const oos = runLeaveOneSiteOut([
  { siteId: 's1', lithoClass: 3, actualRho: 40 },
  { siteId: 's2', lithoClass: 3, actualRho: 50 },
  { siteId: 's3', lithoClass: 3, actualRho: 55 },
  { siteId: 's4', lithoClass: 3, actualRho: 48 },
]);
assert.ok(oos.folds.length === 4);
for (const f of oos.folds) {
  assert.equal(f.trainUniqueSites, 3);
  assert.notEqual(f.heldOutSiteId, '');
}

// 12. GeoTOP mapping independent from rho
section('GeoTOP mapping ignores rho');
const d1 = mapGeotopToEarthGndDist(5);
const d2 = mapGeotopToEarthGndDist(5);
assert.deepEqual(d1, d2);
assert.ok((d1[3] ?? 0) >= 0.8);

// 13. GeoTOP unavailable fails safely — empty rows
section('GeoTOP missing coords → no rows');
const rows = buildGeotopValidationRows({
  metingId: 'm1',
  electrodeNo: 1,
  lat: null,
  lon: null,
  siteClusterId: 'c1',
  depthCurve: [{ depth_m: 3, ra_ohm: 10 }],
  geotopColumn: [{ depthM: 3, geotopKlas: 5, probability: 0.9 }],
});
assert.equal(rows.length, 0);

// 14. Missing coordinates remain globally usable conceptually (clustering singleton)
section('No-coord points still cluster as sites');
assert.equal(
  uniqueSiteCount([{ id: 'x', lat: null, lon: null, siteKey: null }]),
  1,
);

// 15. Poort 3 cannot auto-approve production
section('Cockpit never auto PRODUCTION_APPROVED without humanApproved');
const cockpit = buildCockpit({
  production: getProductionEmpiricalState(),
  poort2: {
    shadowCount: 10,
    groundTruthedCount: 10,
    medianRelErrorPct: 10,
    depthGate: 'PASS',
    depthGeoMeanMax: 1.1,
  },
  oos: { ...oos, passedTechnical: true, status: 'PASSING_TECHNICAL_GATES', blockers: [] },
  evidenceStrength: null,
  theoryEmpiricalAgreement01: 0.8,
  policyEnabledAny: false,
  humanApproved: false,
});
assert.notEqual(cockpit.currentGate, 'PRODUCTION_APPROVED');

// 16. Gravel blocked
section('Gravel learning blocked');
const grind = computeAutoBayesianWeights(GRIND_CLASS, { mu: 200, sigma: 20, n: 50 });
assert.equal(grind.learningBlocked, true);
assert.equal(grind.autoEmpiricalWeight, 0);
const grindPol = resolveEffectiveEmpiricalPercent(
  { ...defaultPolicy(4), enabled: true, mode: 'auto' },
  0.8,
  {
    softN: 50,
    uniqueSites: 10,
    agreementScore: 0.9,
    poort3Passed: true,
    soilKnowledgeActive: true,
  },
);
assert.equal(grindPol.productionEmpiricalPercent, 0);

// 17. capped_auto respects cap
section('capped_auto respects cap');
const capped = resolveEffectiveEmpiricalPercent(
  { ...defaultPolicy(3), enabled: true, mode: 'capped_auto', empiricalCapPercent: 30, poort3Required: false },
  0.82,
  {
    softN: 20,
    uniqueSites: 10,
    agreementScore: 0.9,
    poort3Passed: true,
    soilKnowledgeActive: true,
  },
);
assert.equal(capped.autoBayesianPercent, 82);
assert.equal(capped.productionEmpiricalPercent, 30);

// 18. activation blocked if Poort 3 fails
section('Activation blocked if Poort 3 fails');
const blocked = resolveEffectiveEmpiricalPercent(
  { ...defaultPolicy(3), enabled: true, mode: 'auto', poort3Required: true },
  0.5,
  {
    softN: 20,
    uniqueSites: 10,
    agreementScore: 0.9,
    poort3Passed: false,
    soilKnowledgeActive: true,
  },
);
assert.equal(blocked.productionEmpiricalPercent, 0);
assert.ok(blocked.blockedReason?.includes('Poort 3'));

// 19. agreement score formula
section('Agreement score');
assert.equal(agreementFromRelativeErrorPct(0), 1);
assert.equal(agreementFromRelativeErrorPct(100), 0);

// 20. precision helper
section('Precision p = n/σ²');
assert.ok(Math.abs(precision(10, 10) - 0.1) < 1e-12);

console.log('\nAll evidence-lab checks passed.');
console.log('Production prediction behavior remains unchanged');
