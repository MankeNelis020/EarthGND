/**
 * Golden Set regressietest — beschermt de bevroren theoretische pipeline.
 *
 * Gepinde waarden: als een van deze tests faalt, is de bevroren pipeline gewijzigd.
 * Geen DB, geen netwerk — puur berekening.
 *
 * Dekking:
 *   1. lib/calculations.ts      — calcRhoEffective, calcDiepte, calcOhmAls, calcOhmNoAls, calcParallelRa
 *   2. lib/pipeline/rho-priors  — NL_RHO_WET_PRIOR, resolveRhoWet
 *   3. lib/soil-knowledge/reverse-engine — deriveRhoApparent, estimateClassDistribution, analyzeDepthCurve
 *   4. lib/soil-knowledge/priors         — LITERATURE_PRIOR, CLASS_LOG_SIGMA, drempelwaarden
 *   5. lib/soil-knowledge/bayesian-posterior — computeChainPosterior, computeSafePosterior, isLearningBlocked
 *
 * Gebruik:
 *   npm run golden-set
 *
 * Exitcode: 0 = alles slaagt, 1 = ≥1 test faalt.
 */

import {
  calcRhoEffective, calcDiepte, calcOhmAls, calcOhmNoAls, calcParallelRa,
  LITHO_CLASS_TO_RHO_WET,
} from '../lib/calculations';
import { NL_RHO_WET_PRIOR, resolveRhoWet } from '../lib/pipeline/rho-priors';
import {
  deriveRhoApparent, estimateClassDistribution, analyzeDepthCurve,
} from '../lib/soil-knowledge/reverse-engine';
import {
  LITERATURE_PRIOR, CLASS_LOG_SIGMA, MIN_SOFT_N_GLOBAL, MIN_SOFT_N_REGIONAL,
} from '../lib/soil-knowledge/priors';
import {
  computeChainPosterior, computeSafePosterior, isLearningBlocked, getLiteratureLevel,
} from '../lib/soil-knowledge/bayesian-posterior';
import { FIELD_LOCATIONS } from '../lib/calibration/field-data';

// ── Runner ─────────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function section(title: string): void {
  process.stderr.write(`\n── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}\n`);
}

function check(
  label: string,
  actual: number | boolean | string,
  expected: number | boolean | string,
  tol = 0,
): void {
  let ok: boolean;
  if (typeof actual === 'number' && typeof expected === 'number' && tol > 0) {
    ok = isFinite(actual) && Math.abs(actual - expected) <= tol;
  } else {
    ok = actual === expected;
  }
  if (ok) {
    pass++;
    process.stderr.write(`  ✓  ${label}\n`);
  } else {
    fail++;
    const delta = (typeof actual === 'number' && typeof expected === 'number')
      ? `  delta=${Math.abs(actual - expected).toExponential(3)}`
      : '';
    process.stderr.write(`  ✗  ${label}\n       actual=${actual}  expected=${expected}${tol > 0 ? `  tol=±${tol}` : ''}${delta}\n`);
  }
}

function checkNaN(label: string, actual: number): void {
  if (isNaN(actual)) {
    pass++;
    process.stderr.write(`  ✓  ${label}\n`);
  } else {
    fail++;
    process.stderr.write(`  ✗  ${label}\n       actual=${actual}  expected=NaN\n`);
  }
}

function dominantClass(dist: Partial<Record<number, number>>): number {
  return Object.entries(dist)
    .sort(([, aRaw], [, bRaw]) => (Number(bRaw) || 0) - (Number(aRaw) || 0))
    .map(([k]) => Number(k))[0] ?? -1;
}

// Gepinde referentieformule: identiek aan deriveRhoApparent maar inline geschreven.
// Als ROD_DIAMETER of de formule in reverse-engine.ts wijzigt, divergeren resultaten.
const PINNED_ROD_D = 0.014; // BEVROREN — wijzig hier niet
function refRho(R: number, L: number): number {
  return (R * 2 * Math.PI * L) / Math.log((4 * L) / PINNED_ROD_D);
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Kernel: calcRhoEffective
// ══════════════════════════════════════════════════════════════════════════════

section('calcRhoEffective — twee-laag harmonisch gemiddelde');

// Edge: gwDepth=0 → volledig verzadigd → rhoWet
check('gwDepth=0 → rhoWet', calcRhoEffective(300, 45, 0, 6), 45);

// Edge: gwDepth >= rodLength → volledig droog → rhoDry
check('gwDepth≥rodLength → rhoDry', calcRhoEffective(300, 45, 10, 6), 300);

// Normaal: 2m droog, 4m nat in staaf van 6m
// verwacht = 6 / (2/300 + 4/45) = 6 / (43/450) = 2700/43 ≈ 62.79
check('rhoDry=300 rhoWet=45 gw=2 L=6',
  calcRhoEffective(300, 45, 2, 6),
  6 / (2 / 300 + 4 / 45),
  1e-9,
);

// Exact integer: 6/(1.5/80 + 4.5/10) = 6/0.46875 = 12.8
check('rhoDry=80 rhoWet=10 gw=1.5 L=6', calcRhoEffective(80, 10, 1.5, 6), 12.8, 1e-9);

// ══════════════════════════════════════════════════════════════════════════════
// 2. Kernel: calcDiepte — Dwight iteratief (stap 0.25 m, start L=1.0)
// ══════════════════════════════════════════════════════════════════════════════

section('calcDiepte — éénlaags en tweelaagsmodel');

// Test A: rho=10, target=10 → L=1.0 lost op (R≈9.0002 ≤ 10)
// Analytisch: R(1.0) = (10/2π) × ln(4/0.014) = (10/2π) × ln(2000/7) ≈ 9.0002
{
  const d = calcDiepte({ rho: 10, targetResistance: 10 });
  check('rho=10 target=10 depth=1m',   d.depth, 1);
  check('rho=10 target=10 achievedR≈9', d.achievedResistance, 9.0, 0.01);
  check('rho=10 target=10 converged',   d.converged, true);
}

// Test B: rho=45, target=30 → L=1.25 (R≈33.67) > 30 → L=1.5 (R≈28.94 ≤ 30)
// Analytisch: R(1.5) = (45/2π×1.5) × ln(6/0.014) = (15/π) × ln(3000/7) ≈ 28.94
{
  const d = calcDiepte({ rho: 45, targetResistance: 30 });
  check('rho=45 target=30 depth=1.5m',    d.depth, 1.5);
  check('rho=45 target=30 achievedR≈28.94', d.achievedResistance, 28.94, 0.01);
  check('rho=45 target=30 converged',       d.converged, true);
}

// Test C: twee-laag — rhoDry=300, rhoWet=10, gw=0.5, target=10
// L=1.0: rhoEff=19.35 → R≈17.4; L=1.25: rhoEff=16.30 → R≈12.2; L=1.5: rhoEff=14.75 → R≈9.49 ≤ 10
{
  const d = calcDiepte({ rho: 10, targetResistance: 10, gwDepth: 0.5, rhoDry: 300, rhoWet: 10 });
  check('twee-laag gw=0.5 depth=1.5m',    d.depth, 1.5);
  check('twee-laag gw=0.5 achievedR≈9.49', d.achievedResistance, 9.49, 0.01);
  check('twee-laag gw=0.5 converged',       d.converged, true);
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. Kernel: calcOhmAls
// ══════════════════════════════════════════════════════════════════════════════

section('calcOhmAls — aardlek (TT-stelsel)');

{
  const r = calcOhmAls({ voltage: 230, leakageCurrent: 0.03 });
  // 166-fix (2026-06): UL/IΔn — geen universele 166-cap (zie docs/contracts.md §A).
  // 30 mA RCD @230 V: r_theoretical = 230/0.03 = 7666.67 Ω.
  // r_practical = r_theoretical (geen cap) — bij 50 V zou het 50/0.03 = 1667 Ω zijn.
  // r_recommended blijft ≤ 30 Ω (good-practice drempel, geen normatieve bovengrens).
  check('r_theoretical ≈ 7666.7', r.r_theoretical, 7666.67, 0.1);
  check('r_practical = r_theoretical', r.r_practical, r.r_theoretical, 0.1);
  check('r_recommended = 30',     r.r_recommended, 30);
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. Kernel: calcOhmNoAls
// ══════════════════════════════════════════════════════════════════════════════

section('calcOhmNoAls — automaat zonder aardlek');

{
  const r = calcOhmNoAls({ nominalCurrent: 16, breakerType: 'B', cableLength: 30, crossSection: 2.5 });
  // ia = 16 × 5 = 80; zs_max = 230/80 = 2.875
  // r_cable = (2 × 0.0175 × 30) / 2.5 = 0.42
  // r_pen_max = 2.875 − 0.42 = 2.455; warning = false
  check('ia = 80',         r.ia, 80);
  check('zs_max = 2.875',  r.zs_max, 2.875);
  check('r_cable = 0.42',  r.r_cable, 0.42, 1e-9);
  check('r_pen_max = 2.455', r.r_pen_max, 2.455, 1e-9);
  check('warning = false', r.warning, false);
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. Kernel: calcParallelRa
// ══════════════════════════════════════════════════════════════════════════════

section('calcParallelRa — parallelle pennen (Schwarz)');

{
  // rho=45, L=6m, d=0.014m, n=2
  // R1 = (45/2π×6) × ln(4×6/0.014) = (15/2π) × ln(12000/7) ≈ 8.89
  // spacingMin = ceil(2×6) = 12
  // M(s=12) = 45/(2π×12) ≈ 0.5968; sumM = 0.5968
  // rParallel = (2×R1 + 2×M)/(4) ≈ 4.74
  const p = calcParallelRa(45, 6, 0.014, 2);
  check('rSingle ≈ 8.89',    p.rSingle, 8.89, 0.01);
  check('spacingMin = 12',   p.spacingMin, 12);
  check('rParallel ≈ 4.74',  p.rParallel, 4.74, 0.01);
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. Kernel: LITHO_CLASS_TO_RHO_WET — internationale referentietabel (bevroren)
// ══════════════════════════════════════════════════════════════════════════════

section('LITHO_CLASS_TO_RHO_WET — kernel internationale tabel (bevroren)');

// Drie veen-waarden — elk correct voor zijn context (zie docs/contracts.md §C):
//   LITHO_CLASS_TO_RHO_WET[5] = 20  → kernel-WET (BRO CPT/boring), NL laagveen/polderveen prior
//   NL_RHO_WET_PRIOR[5]       = 10  → NL veldkalibratie 2026-06
//   LITHO_CLASS_TO_RHO_DRY[5] = 3000 → enkelvoudig/droog model (legacy fallback)
check('k=1 klei  = 15 Ω·m',  LITHO_CLASS_TO_RHO_WET[1] ?? 0, 15);
check('k=2 leem  = 40 Ω·m',  LITHO_CLASS_TO_RHO_WET[2] ?? 0, 40);
check('k=3 zand  = 60 Ω·m',  LITHO_CLASS_TO_RHO_WET[3] ?? 0, 60);
check('k=4 grind = 150 Ω·m', LITHO_CLASS_TO_RHO_WET[4] ?? 0, 150);
check('k=5 veen  = 20 Ω·m',  LITHO_CLASS_TO_RHO_WET[5] ?? 0, 20); // kernel-WET (NL CPT-statistiek) — bevroren

// ══════════════════════════════════════════════════════════════════════════════
// 7. NL rho-priors: NL_RHO_WET_PRIOR — empirische NL-correctie (Fase 0, 2026-06)
// ══════════════════════════════════════════════════════════════════════════════

section('NL_RHO_WET_PRIOR — NL-gekalibreerde priors (Fase 0, 2026-06)');

check('k=1 klei  = 10 Ω·m',  NL_RHO_WET_PRIOR[1] ?? 0, 10);
check('k=2 leem  = 20 Ω·m',  NL_RHO_WET_PRIOR[2] ?? 0, 20);
check('k=3 zand  = 45 Ω·m',  NL_RHO_WET_PRIOR[3] ?? 0, 45);
check('k=4 grind = 110 Ω·m', NL_RHO_WET_PRIOR[4] ?? 0, 110);
check('k=5 veen  = 10 Ω·m',  NL_RHO_WET_PRIOR[5] ?? 0, 10);

// ══════════════════════════════════════════════════════════════════════════════
// 8. NL rho-priors: resolveRhoWet — prioriteitsketen
// ══════════════════════════════════════════════════════════════════════════════

section('resolveRhoWet — prioriteit: NL prior > kernel tabel > 0.45×fallback');

// Bekende klassen: NL prior overrulet kernel tabel
check('resolveRhoWet(1,…)  = 10',  resolveRhoWet(1, 100), 10);
check('resolveRhoWet(2,…)  = 20',  resolveRhoWet(2, 100), 20);
check('resolveRhoWet(3,…)  = 45',  resolveRhoWet(3, 100), 45);
check('resolveRhoWet(4,…)  = 110', resolveRhoWet(4, 100), 110);
check('resolveRhoWet(5,…)  = 10',  resolveRhoWet(5, 100), 10);

// Klasse 6 (rots): niet in NL prior → kernel tabel 4000
check('resolveRhoWet(6,…)  = 4000', resolveRhoWet(6, 100), 4000);

// null lithoClass → 0.45 × rhoFallback (afgerond)
check('resolveRhoWet(null,100) = 45', resolveRhoWet(null, 100), 45);

// ══════════════════════════════════════════════════════════════════════════════
// 9. Reverse engine: deriveRhoApparent
// ══════════════════════════════════════════════════════════════════════════════

section('deriveRhoApparent — Dwight-inversie (geen −1 term, kernel-consistent)');

// Ongeldige invoer → NaN
checkNaN('R=0 → NaN',    deriveRhoApparent(0, 3));
checkNaN('R<0 → NaN',    deriveRhoApparent(-1, 3));
checkNaN('depth=0 → NaN', deriveRhoApparent(31, 0));

// Veldpunten — verwacht == refRho (pinned formule met d=0.014, geen −1)
// IJmuiden 3m (boven GWT ligt dicht, punt net verzadigd): hoge ρ door zandige grond
const ij = FIELD_LOCATIONS.find(l => l.id === 'ijmuiden')!;
check('IJmuiden 3m  rhoApparent matches formula',
  deriveRhoApparent(ij.depthCurve[0].rMeasured, ij.depthCurve[0].depthM),
  refRho(ij.depthCurve[0].rMeasured, ij.depthCurve[0].depthM),
  1e-9,
);
check('IJmuiden 30m rhoApparent matches formula',
  deriveRhoApparent(ij.depthCurve[9].rMeasured, ij.depthCurve[9].depthM),
  refRho(ij.depthCurve[9].rMeasured, ij.depthCurve[9].depthM),
  1e-9,
);

// Amersfoort (zand) — diepe punten convergeren naar stabiele ρ ≈ 41-52 Ω·m
const am = FIELD_LOCATIONS.find(l => l.id === 'amersfoort')!;
check('Amersfoort 3m  rhoApparent matches formula',
  deriveRhoApparent(am.depthCurve[0].rMeasured, am.depthCurve[0].depthM),
  refRho(am.depthCurve[0].rMeasured, am.depthCurve[0].depthM),
  1e-9,
);
check('Amersfoort 30m rhoApparent matches formula',
  deriveRhoApparent(am.depthCurve[9].rMeasured, am.depthCurve[9].depthM),
  refRho(am.depthCurve[9].rMeasured, am.depthCurve[9].depthM),
  1e-9,
);

// ══════════════════════════════════════════════════════════════════════════════
// 10. Reverse engine: estimateClassDistribution
// ══════════════════════════════════════════════════════════════════════════════

section('estimateClassDistribution — lognormale likelihood per klasse');

// Ongeldige invoer → uniforme verdeling
{
  const dist = estimateClassDistribution(0);
  check('ρ=0 → uniform k=1', dist[1] ?? 0, 0.2, 1e-9);
  check('ρ=0 → uniform k=3', dist[3] ?? 0, 0.2, 1e-9);
}

// Som van kansen ≈ 1.0
{
  const sum45 = Object.values(estimateClassDistribution(45)).reduce<number>((a, b) => a + (b ?? 0), 0);
  check('ρ=45 som = 1.0', sum45, 1.0, 1e-9);

  const sum10 = Object.values(estimateClassDistribution(10)).reduce<number>((a, b) => a + (b ?? 0), 0);
  check('ρ=10 som = 1.0', sum10, 1.0, 1e-9);
}

// Dominante klasse bij bekende ρ-waarden
// ρ=10 → k=5 (veen): beide klei/veen hebben μ=10, maar veen heeft smallere logSigma → hogere piek
check('ρ=10 dominant = veen (k=5)',   dominantClass(estimateClassDistribution(10)), 5);
// ρ=45 → k=3 (zand): centroid van zand (μ=45)
check('ρ=45 dominant = zand (k=3)',   dominantClass(estimateClassDistribution(45)), 3);
// ρ=110 → k=4 (grind): centroid van grind (μ=110)
check('ρ=110 dominant = grind (k=4)', dominantClass(estimateClassDistribution(110)), 4);

// ══════════════════════════════════════════════════════════════════════════════
// 11. Reverse engine: analyzeDepthCurve
// ══════════════════════════════════════════════════════════════════════════════

section('analyzeDepthCurve — dieptecurve → AnalyzedDepthPoint[]');

// Boskoop (veen/klei, GWT=0.3m): alle 2 punten (3m, 6m) liggen onder GWT → wet
{
  const bos = FIELD_LOCATIONS.find(l => l.id === 'boskoop')!;
  const bosCurve = bos.depthCurve.map(p => ({ depth: p.depthM, ra: p.rMeasured }));
  const analyzed = analyzeDepthCurve(bosCurve, bos.groundwaterDepthM);

  check('Boskoop: 2 geanalyseerde punten',    analyzed.length, 2);
  check('Boskoop: punt 0 zone = wet',         analyzed[0].zone, 'wet');
  check('Boskoop: punt 1 zone = wet',         analyzed[1].zone, 'wet');
  check('Boskoop 3m rhoApparent = refRho',
    analyzed[0].rhoApparent,
    refRho(bos.depthCurve[0].rMeasured, bos.depthCurve[0].depthM),
    1e-9,
  );
  // Klassesom per punt ≈ 1
  const classSum = Object.values(analyzed[0].classDist).reduce<number>((a, b) => a + (b ?? 0), 0);
  check('Boskoop 3m classDistributiesom = 1', classSum, 1.0, 1e-9);
}

// IJmuiden (kleiig zand, GWT=2.0m): alle 10 punten (3–30m) liggen onder GWT → wet
{
  const ijCurve = ij.depthCurve.map(p => ({ depth: p.depthM, ra: p.rMeasured }));
  const analyzed = analyzeDepthCurve(ijCurve, ij.groundwaterDepthM);

  check('IJmuiden: 10 geanalyseerde punten',  analyzed.length, 10);
  check('IJmuiden: alle zones = wet',
    analyzed.every(p => p.zone === 'wet') ? 'ok' : 'fail', 'ok',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. Priors: LITERATURE_PRIOR + CLASS_LOG_SIGMA (bevroren)
// ══════════════════════════════════════════════════════════════════════════════

section('LITERATURE_PRIOR + CLASS_LOG_SIGMA — bevroren L1-ankerpunten');

// μ per klasse (identiek aan NL_RHO_WET_PRIOR)
check('k=1 klei  mu = 10',  LITERATURE_PRIOR[1].mu,  10);
check('k=2 leem  mu = 20',  LITERATURE_PRIOR[2].mu,  20);
check('k=3 zand  mu = 45',  LITERATURE_PRIOR[3].mu,  45);
check('k=4 grind mu = 110', LITERATURE_PRIOR[4].mu, 110);
check('k=5 veen  mu = 10',  LITERATURE_PRIOR[5].mu,  10);

// σ (spreiding — bepaalt hoe snel velddata de prior overschrijft)
check('k=3 zand  sigma = 15',  LITERATURE_PRIOR[3].sigma,  15);
check('k=4 grind sigma = 55',  LITERATURE_PRIOR[4].sigma,  55);

// nVirtual (lage waarden = veld overschrijft sneller)
check('k=4 grind nVirtual = 1 (zwakste prior)', LITERATURE_PRIOR[4].nVirtual, 1);
check('k=3 zand  nVirtual = 5 (sterkste prior)', LITERATURE_PRIOR[3].nVirtual, 5);

// Log-sigma per klasse (likelihood-breedte voor estimateClassDistribution)
check('CLASS_LOG_SIGMA[3] zand  = 0.40', CLASS_LOG_SIGMA[3], 0.40);
check('CLASS_LOG_SIGMA[4] grind = 0.65', CLASS_LOG_SIGMA[4], 0.65);

// Drempelwaarden (bepalen wanneer geleerde prior actief wordt)
check('MIN_SOFT_N_GLOBAL   = 5', MIN_SOFT_N_GLOBAL, 5);
check('MIN_SOFT_N_REGIONAL = 3', MIN_SOFT_N_REGIONAL, 3);

// ══════════════════════════════════════════════════════════════════════════════
// 13. Bayesian posterior: computeChainPosterior
// ══════════════════════════════════════════════════════════════════════════════

section('computeChainPosterior — hiërarchische keten L1→L2→L3→L4');

const L1_ZAND = getLiteratureLevel(3); // {mu:45, sigma:15, n:5}

// Test A: L1 + L2 (L3=L4=null)
// Analytisch:
//   p1 = 5/225 = 1/45;  p2 = 20/100 = 1/5
//   totalP = 2/9;  weighted = 1.0 + 8.0 = 9.0
//   mu = 9.0/(2/9) = 40.5  (exact)
//   sigma = sqrt(1/(2/9)) = sqrt(4.5) = 3/√2 ≈ 2.12132
//   n = 25
{
  const L2: { mu: number; sigma: number; n: number } = { mu: 40, sigma: 10, n: 20 };
  const r = computeChainPosterior(L1_ZAND, L2, null, null);

  check('L1+L2 mu = 40.5',          r.mu, 40.5, 1e-6);
  check('L1+L2 sigma = √4.5',       r.sigma, Math.sqrt(4.5), 1e-9);
  check('L1+L2 n = 25',             r.n, 25);
  check('L1+L2 breakdown.l2 != null', r.breakdown.l2 !== null ? 'ok' : 'fail', 'ok');
  check('L1+L2 breakdown.l3 = null',  r.breakdown.l3 === null ? 'ok' : 'fail', 'ok');
}

// Test B: alleen L1 (L2=L3=L4=null) → geeft L1 terug ongewijzigd
{
  const r = computeChainPosterior(L1_ZAND, null, null, null);

  check('L1-only mu = 45',    r.mu, 45);
  check('L1-only sigma = 15', r.sigma, 15);
  check('L1-only n = 5',      r.n, 5);
}

// ══════════════════════════════════════════════════════════════════════════════
// 14. Bayesian posterior: computeSafePosterior
// ══════════════════════════════════════════════════════════════════════════════

section('computeSafePosterior — fijnste niveau + L1 (geen double counting)');

// Test A: L4 aanwezig → finest = L4; posterior = computePosterior(L1, L4)
// p1=5/225, p4=8/25; mu=(1.0+12.16)/(1/45+0.32) = 13.16×225/77 = 2961/77 ≈ 38.45
{
  const L2: { mu: number; sigma: number; n: number } = { mu: 40, sigma: 10, n: 20 };
  const L3: { mu: number; sigma: number; n: number } = { mu: 42, sigma: 12, n: 15 };
  const L4: { mu: number; sigma: number; n: number } = { mu: 38, sigma: 5,  n: 8  };
  const r = computeSafePosterior(L1_ZAND, L2, L3, L4);

  check('safePosterior met L4: mu ≈ 38.45', r.mu, 2961 / 77, 0.001);
  check('safePosterior met L4: n = 13',     r.n, 13);
}

// Test B: geen L4 → finest = L3; posterior = computePosterior(L1, L3)
// p1=5/225, p3=15/144; mu=(1.0+4.375)/(1/45+5/48) = 5.375×720/91 = 3870/91 ≈ 42.527
{
  const L3: { mu: number; sigma: number; n: number } = { mu: 42, sigma: 12, n: 15 };
  const r = computeSafePosterior(L1_ZAND, null, L3, null);

  check('safePosterior zonder L4: mu ≈ 42.53', r.mu, 3870 / 91, 0.001);
  check('safePosterior zonder L4: n = 20',     r.n, 20);
}

// ══════════════════════════════════════════════════════════════════════════════
// 15. Bayesian posterior: isLearningBlocked
// ══════════════════════════════════════════════════════════════════════════════

section('isLearningBlocked — grind geblokkeerd, alle andere klassen open');

check('k=4 grind: geblokkeerd',    isLearningBlocked(4), true);
check('k=1 klei:  niet geblokkeerd', isLearningBlocked(1), false);
check('k=2 leem:  niet geblokkeerd', isLearningBlocked(2), false);
check('k=3 zand:  niet geblokkeerd', isLearningBlocked(3), false);
check('k=5 veen:  niet geblokkeerd', isLearningBlocked(5), false);

// ══════════════════════════════════════════════════════════════════════════════
// Samenvatting
// ══════════════════════════════════════════════════════════════════════════════

section('Samenvatting');

const total = pass + fail;
process.stderr.write(`\n  Geslaagd:  ${pass}/${total}\n`);
process.stderr.write(`  Gefaald:   ${fail}/${total}\n`);

if (fail === 0) {
  process.stderr.write('\n  GOLDEN SET: PASS — theoretische pipeline ongewijzigd.\n\n');
} else {
  process.stderr.write(`\n  GOLDEN SET: FAIL — ${fail} test(s) gefaald.\n`);
  process.stderr.write('  Controleer of lib/calculations.ts, rho-priors.ts of soil-knowledge is gewijzigd.\n\n');
  process.exit(1);
}
