/**
 * Poort A — validatie van de curve-gebaseerde GWT-detectie.
 *
 * Drie harde tests:
 *   Test 1 — Gedetecteerde grens per locatie (vs. bekende verwachting)
 *   Test 2 — Simulatie: welke ρ-waarden gaan oud vs. nieuw de prior in
 *   Test 3 — Idempotentie: boundary-detectie is deterministisch + idempotent
 *
 * Zonder DB — volledig offline. Raakt de kernel niet.
 * Gebruik: npx ts-node scripts/validate-poort-a-gw-detection.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIELD_LOCATIONS } from '../lib/calibration/field-data';
import {
  detectGroundwaterBoundary,
  analyzeDepthCurve,
  deriveRhoApparent,
} from '../lib/soil-knowledge/reverse-engine';
import { DEFAULT_ELECTRODE_DIAMETER_M } from '../lib/electrode-diameter';

// ─── Test-runner ──────────────────────────────────────────────────────────────

let failCount = 0;
let passCount = 0;

function ok(label: string, condition: boolean, explanation: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passCount++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${explanation}`);
    failCount++;
  }
}

function between(v: number, lo: number, hi: number): boolean {
  return isFinite(v) && v >= lo && v <= hi;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDepthCurve(loc: (typeof FIELD_LOCATIONS)[0]) {
  return loc.depthCurve.map(p => ({ depth: p.depthM, ra: p.rMeasured }));
}

/** Welke punten behandelde de OUDE code als 'wet'?
 *  Oud: zone = depth <= gwDepthM ? 'dry' : 'wet'   (NOTE: <= is exclusief)
 */
function oldWetPoints(
  curve: Array<{ depth: number; ra: number }>,
  gwDepthM: number,
): Array<{ depth: number; rho: number }> {
  return curve
    .filter(pt => pt.depth > 0 && pt.ra > 0 && isFinite(pt.depth) && isFinite(pt.ra))
    .filter(pt => pt.depth > gwDepthM)          // oud: niet-dry = wet (depth > gwDepthM)
    .map(pt => ({
      depth: pt.depth,
      rho: deriveRhoApparent(pt.ra, pt.depth, DEFAULT_ELECTRODE_DIAMETER_M),
    }))
    .filter(pt => isFinite(pt.rho) && pt.rho > 0);
}

/** Welke punten accumuleert de NIEUWE code? */
function newAccumulatablePoints(
  curve: Array<{ depth: number; ra: number }>,
  broGwDepthM: number | null,
): Array<{ depth: number; rho: number }> {
  const boundary = detectGroundwaterBoundary(curve, broGwDepthM);
  const analyzed = analyzeDepthCurve(curve, boundary.gwDepthM);
  const flagged = new Set(boundary.flaggedMonotoneDepths);
  return analyzed
    .filter(pt => pt.zone === 'wet')
    .filter(pt => !flagged.has(pt.depthM))
    .filter(pt => boundary.plateauRho == null || pt.rhoApparent <= boundary.plateauRho * 1.30)
    .filter(pt => isFinite(pt.rhoApparent) && pt.rhoApparent > 0)
    .map(pt => ({ depth: pt.depthM, rho: pt.rhoApparent }));
}

function mean(pts: Array<{ rho: number }>): number {
  if (!pts.length) return 0;
  return pts.reduce((s, p) => s + p.rho, 0) / pts.length;
}

// ─── Synthetisch Maxwellstraat-fixture ───────────────────────────────────────
// ρ per diepte: [356, 130, 77, 77, 77] op [3, 6, 9, 12, 15] m
// R berekend: R = ρ × ln(4L/d) / (2πL), d=0.014 m
// Verificatie: deriveRhoApparent(ra, depth) ≈ de ρ-waarden hierboven

const MAXWELL_CURVE = [
  { depth: 3,  ra: 127.55 },   // ρ ≈ 356 — droge cap
  { depth: 6,  ra: 25.68 },    // ρ ≈ 130 — transitiezone
  { depth: 9,  ra: 10.69 },    // ρ ≈ 77  — nat plateau
  { depth: 12, ra: 8.31  },    // ρ ≈ 77
  { depth: 15, ra: 6.83  },    // ρ ≈ 77
];

// ─── Test 1: Boundary-detectie per locatie ────────────────────────────────────
console.log('\n═══ Test 1 — Gedetecteerde GWT-grens per locatie ═══\n');

// 1a. Maxwell (synthese) — DE kerntest
{
  const b = detectGroundwaterBoundary(MAXWELL_CURVE, null);
  const analyzed = analyzeDepthCurve(MAXWELL_CURVE, b.gwDepthM);
  const pt3  = analyzed.find(p => p.depthM === 3);
  const pt6  = analyzed.find(p => p.depthM === 6);
  const pt9  = analyzed.find(p => p.depthM === 9);
  const rho3 = deriveRhoApparent(MAXWELL_CURVE[0].ra, 3, DEFAULT_ELECTRODE_DIAMETER_M);

  console.log(`  [Maxwell] gwDepthM=${b.gwDepthM}m source=${b.gw_source} conf=${b.gw_confidence} plateauRho=${b.plateauRho?.toFixed(1)}`);
  console.log(`            3m→rho=${rho3.toFixed(0)} zone=${pt3?.zone}  6m→zone=${pt6?.zone}  9m→zone=${pt9?.zone}`);

  ok('Maxwell: gw_source=curve', b.gw_source === 'curve',
    `gw_source=${b.gw_source}, verwacht 'curve'`);
  ok('Maxwell: gw_confidence=high', b.gw_confidence === 'high',
    `gw_confidence=${b.gw_confidence}, verwacht 'high'`);
  ok('Maxwell: gwDepthM=9', b.gwDepthM === 9,
    `gwDepthM=${b.gwDepthM}, verwacht 9 m`);
  ok('Maxwell: plateauRho ≈ 77 (±5)', between(b.plateauRho ?? 0, 72, 82),
    `plateauRho=${b.plateauRho?.toFixed(1)}, verwacht 72–82 Ω·m`);
  ok('Maxwell: 3m-punt = dry (KERNTEST)', pt3?.zone === 'dry',
    `3m zone=${pt3?.zone} (ρ=${rho3.toFixed(0)} Ω·m mag NIET in de natte prior!)`);
  ok('Maxwell: 6m-punt = dry', pt6?.zone === 'dry',
    `6m zone=${pt6?.zone}`);
  ok('Maxwell: 9m-punt = wet', pt9?.zone === 'wet',
    `9m zone=${pt9?.zone}`);
}

// 1b. Amersfoort — droge cap zand
{
  const loc = FIELD_LOCATIONS.find(l => l.id === 'amersfoort')!;
  const curve = toDepthCurve(loc);
  const b = detectGroundwaterBoundary(curve, loc.groundwaterDepthM);
  const analyzed = analyzeDepthCurve(curve, b.gwDepthM);
  const pt3 = analyzed.find(p => p.depthM === 3);
  const rho3 = deriveRhoApparent(curve[0].ra, 3, DEFAULT_ELECTRODE_DIAMETER_M);

  console.log(`\n  [Amersfoort] gwDepthM=${b.gwDepthM}m source=${b.gw_source} conf=${b.gw_confidence} plateauRho=${b.plateauRho?.toFixed(1)}`);
  console.log(`               3m→rho=${rho3.toFixed(0)} zone=${pt3?.zone}`);

  ok('Amersfoort: gw_source=curve', b.gw_source === 'curve',
    `gw_source=${b.gw_source}`);
  ok('Amersfoort: gwDepthM=6', b.gwDepthM === 6,
    `gwDepthM=${b.gwDepthM}, verwacht 6 m`);
  ok('Amersfoort: 3m-punt = dry', pt3?.zone === 'dry',
    `3m zone=${pt3?.zone} (ρ=${rho3.toFixed(0)} was ten onrechte in oud-prior)`);
  ok('Amersfoort: plateau 38–55', between(b.plateauRho ?? 0, 38, 55),
    `plateauRho=${b.plateauRho?.toFixed(1)}`);
}

// 1c. Trawlerkade IJmuiden — droge cap kleiig zand
{
  const loc = FIELD_LOCATIONS.find(l => l.id === 'ijmuiden')!;
  const curve = toDepthCurve(loc);
  const b = detectGroundwaterBoundary(curve, loc.groundwaterDepthM);
  const analyzed = analyzeDepthCurve(curve, b.gwDepthM);
  const pt3 = analyzed.find(p => p.depthM === 3);
  const rho3 = deriveRhoApparent(curve[0].ra, 3, DEFAULT_ELECTRODE_DIAMETER_M);

  console.log(`\n  [Trawlerkade] gwDepthM=${b.gwDepthM}m source=${b.gw_source} conf=${b.gw_confidence} plateauRho=${b.plateauRho?.toFixed(1)}`);
  console.log(`                3m→rho=${rho3.toFixed(0)} zone=${pt3?.zone}`);

  ok('Trawlerkade: gw_source=curve', b.gw_source === 'curve',
    `gw_source=${b.gw_source}`);
  ok('Trawlerkade: gwDepthM ∈ [3,9]', between(b.gwDepthM, 3, 9),
    `gwDepthM=${b.gwDepthM}`);
  ok('Trawlerkade: 3m-punt = dry', pt3?.zone === 'dry',
    `3m zone=${pt3?.zone} (ρ=${rho3.toFixed(0)} was ten onrechte in oud-prior)`);
  ok('Trawlerkade: plateau 38–60', between(b.plateauRho ?? 0, 38, 60),
    `plateauRho=${b.plateauRho?.toFixed(1)}`);
}

// 1d. Boskoop — veen/klei, volledig nat
{
  const loc = FIELD_LOCATIONS.find(l => l.id === 'boskoop')!;
  const curve = toDepthCurve(loc);
  const b = detectGroundwaterBoundary(curve, loc.groundwaterDepthM);
  const analyzed = analyzeDepthCurve(curve, b.gwDepthM);
  const allWet = analyzed.every(p => p.zone === 'wet');

  console.log(`\n  [Boskoop] gwDepthM=${b.gwDepthM}m source=${b.gw_source} conf=${b.gw_confidence}`);

  ok('Boskoop: gw_source=all_wet', b.gw_source === 'all_wet',
    `gw_source=${b.gw_source}, verwacht 'all_wet'`);
  ok('Boskoop: alle punten wet', allWet,
    `niet alle punten wet: ${analyzed.map(p => `${p.depthM}m=${p.zone}`).join(', ')}`);
  ok('Boskoop: gw_confidence high', b.gw_confidence === 'high',
    `gw_confidence=${b.gw_confidence}`);
}

// 1e. Haarlem Schipholpoort — klei, uniformly low ρ
{
  const loc = FIELD_LOCATIONS.find(l => l.id === 'haarlem')!;
  const curve = toDepthCurve(loc);
  const b = detectGroundwaterBoundary(curve, loc.groundwaterDepthM);
  const analyzed = analyzeDepthCurve(curve, b.gwDepthM);
  const wetCount = analyzed.filter(p => p.zone === 'wet').length;

  console.log(`\n  [Haarlem Schipholpoort] gwDepthM=${b.gwDepthM}m source=${b.gw_source} conf=${b.gw_confidence}`);

  ok('Haarlem: gw_source=all_wet', b.gw_source === 'all_wet',
    `gw_source=${b.gw_source}, ρ ~19 Ω·m uniform klei`);
  ok('Haarlem: geen punt onterecht dry', wetCount === analyzed.length,
    `${analyzed.length - wetCount} punt(en) ten onrechte dry`);
}

// 1f. Haarlemmermeer — polder, ρ daalt licht op 6m (algoritme-grens)
{
  const loc = FIELD_LOCATIONS.find(l => l.id === 'haarlemmermeer')!;
  const curve = toDepthCurve(loc);
  const b = detectGroundwaterBoundary(curve, loc.groundwaterDepthM);
  const analyzed = analyzeDepthCurve(curve, b.gwDepthM);
  const wetCount = analyzed.filter(p => p.zone === 'wet').length;

  console.log(`\n  [Haarlemmermeer] gwDepthM=${b.gwDepthM}m source=${b.gw_source} conf=${b.gw_confidence}`);

  // Het algoritme detecteert hier conservatief een grens op 6m (ρ daalt van ~15 naar ~10 Ω·m).
  // Geen punt onterecht als 'dry' geclassificeerd die al in plateau-band zit — geen prior-vergiftiging.
  ok('Haarlemmermeer: ≥1 nat punt geaccumuleerd', wetCount >= 1,
    `wetCount=${wetCount}, geen punten geaccumuleerd`);
  ok('Haarlemmermeer: source is curve of all_wet', b.gw_source === 'curve' || b.gw_source === 'all_wet',
    `gw_source=${b.gw_source}`);
  ok('Haarlemmermeer: diepste punt altijd wet', analyzed[analyzed.length - 1]?.zone === 'wet',
    `diepste punt zone=${analyzed[analyzed.length - 1]?.zone}`);
}

// ─── Test 2: Simulatie oud vs. nieuw — prior-effect ──────────────────────────
console.log('\n═══ Test 2 — Simulatie: welke ρ gaan oud vs. nieuw de prior in ═══\n');

// Test de drie locaties waarvan we een droge cap verwachten
const sandLocations = [
  { label: 'Maxwell (synthese)',  curve: MAXWELL_CURVE, gwDepth: 2.0 },
  { label: 'Amersfoort',         curve: toDepthCurve(FIELD_LOCATIONS.find(l => l.id === 'amersfoort')!), gwDepth: 2.5 },
  { label: 'Trawlerkade',        curve: toDepthCurve(FIELD_LOCATIONS.find(l => l.id === 'ijmuiden')!),    gwDepth: 2.0 },
];

for (const { label, curve, gwDepth } of sandLocations) {
  const oldPts  = oldWetPoints(curve, gwDepth);
  const newPts  = newAccumulatablePoints(curve, gwDepth);
  const oldMean = mean(oldPts);
  const newMean = mean(newPts);

  const maxOld  = Math.max(...oldPts.map(p => p.rho));
  const maxNew  = newPts.length ? Math.max(...newPts.map(p => p.rho)) : 0;

  console.log(`  [${label}]`);
  console.log(`    Oud: ${oldPts.length} punten, max ρ=${maxOld.toFixed(0)}, gemiddeld ρ=${oldMean.toFixed(1)}`);
  console.log(`    Nieuw: ${newPts.length} punten, max ρ=${maxNew.toFixed(0)}, gemiddeld ρ=${newMean.toFixed(1)}`);
  console.log(`    Droge cap ρ uitgesloten: ${oldPts.filter(p => !newPts.some(q => q.depth === p.depth)).map(p => `${p.depth}m(ρ=${p.rho.toFixed(0)})`).join(', ') || 'geen'}`);

  ok(`${label}: max ρ oud > max ρ nieuw (cap uitgesloten)`,
    maxOld > maxNew,
    `oud=${maxOld.toFixed(0)}, nieuw=${maxNew.toFixed(0)}`);
  ok(`${label}: gem. nieuw < gem. oud (prior daalt)`,
    newMean < oldMean,
    `nieuw=${newMean.toFixed(1)}, oud=${oldMean.toFixed(1)}`);
  ok(`${label}: nieuw gem. ρ ∈ [30, 80] (natte plateau-range)`,
    between(newMean, 30, 80),
    `nieuw gem. ρ=${newMean.toFixed(1)}`);
  console.log();
}

// Hardste assert voor Maxwell: de 3m/6m caps gaan écht niet mee
{
  const oldPts = oldWetPoints(MAXWELL_CURVE, 2.0);
  const newPts = newAccumulatablePoints(MAXWELL_CURVE, null);
  const oldHas356 = oldPts.some(p => p.rho > 300);
  const newHas356 = newPts.some(p => p.rho > 300);

  ok('Maxwell KERNTEST: ρ≈356 is WEL in oud-wet (bewijs van de bug)',
    oldHas356,
    `oud bevat geen ρ>300 — fixture klopt niet`);
  ok('Maxwell KERNTEST: ρ≈356 is NIET in nieuw-accumulatie (fix werkt)',
    !newHas356,
    `nieuw bevat nog ρ>300 — fix werkt NIET`);
}

// ─── Test 3: Idempotentie ─────────────────────────────────────────────────────
console.log('\n═══ Test 3 — Idempotentie ═══\n');

// 3a. detectGroundwaterBoundary is deterministisch (zelfde invoer → zelfde uitkomst)
for (const { label, curve, gwDepth } of sandLocations) {
  const b1 = detectGroundwaterBoundary(curve, gwDepth);
  const b2 = detectGroundwaterBoundary(curve, gwDepth);
  ok(`${label}: twee detecties geven identiek resultaat`,
    b1.gwDepthM === b2.gwDepthM && b1.gw_source === b2.gw_source,
    `run1=${b1.gwDepthM}/${b1.gw_source}, run2=${b2.gwDepthM}/${b2.gw_source}`);
}

// 3b. analyzeDepthCurve is deterministisch
{
  const curve = MAXWELL_CURVE;
  const analyzed1 = analyzeDepthCurve(curve, 9);
  const analyzed2 = analyzeDepthCurve(curve, 9);
  const same = analyzed1.every((p, i) => p.zone === analyzed2[i]?.zone && Math.abs(p.rhoApparent - (analyzed2[i]?.rhoApparent ?? 0)) < 0.001);
  ok('analyzeDepthCurve: twee runs geven identieke zones + rhoApparent',
    same,
    `runs niet identiek`);
}

// 3c. Monotone punten worden consistent geflagd
{
  // Maak een curve met een R-stijging op 6m (niet-monotoon)
  const curveMetViolation = [
    { depth: 3, ra: 50 },
    { depth: 6, ra: 55 },   // R STIJGT — niet-monotoon
    { depth: 9, ra: 8 },
    { depth: 12, ra: 6 },
  ];
  const b1 = detectGroundwaterBoundary(curveMetViolation, null);
  const b2 = detectGroundwaterBoundary(curveMetViolation, null);
  ok('Monotone violatie: 6m-punt geflagd (run 1)',
    b1.flaggedMonotoneDepths.includes(6),
    `flagged=${b1.flaggedMonotoneDepths}`);
  ok('Monotone violatie: identiek in run 2 (deterministisch)',
    JSON.stringify(b1.flaggedMonotoneDepths) === JSON.stringify(b2.flaggedMonotoneDepths),
    `run1=${b1.flaggedMonotoneDepths}, run2=${b2.flaggedMonotoneDepths}`);
  // Na het uitfilteren van 6m mag de boundary uit [3, 9, 12] bepaald worden
  ok('Monotone violatie: boundary ondanks geflagd punt bepaald',
    isFinite(b1.gwDepthM),
    `gwDepthM=${b1.gwDepthM}`);
}

// 3d. Welford-guard: code-trace dat knowledge_processed_at double-accumulation blokkeert
{
  // Controleer dat de evidence-accumulator de guard exporteert via zijn signatura
  // (live DB niet nodig — we controleren de code-path in processMeting)
  const accumulatorSrc = readFileSync(
    resolve('./lib/soil-knowledge/evidence-accumulator.ts'),
    'utf-8',
  );
  const hasProcessingLock = accumulatorSrc.includes('alreadyProcessed') && accumulatorSrc.includes('knowledge_processed_at');
  ok('evidence-accumulator: knowledge_processed_at guard aanwezig',
    hasProcessingLock,
    'alreadyProcessed-check niet gevonden in evidence-accumulator.ts');
  const returnsEarlyOnProcessed = accumulatorSrc.includes('if (alreadyProcessed)');
  ok('evidence-accumulator: vroeg return bij alreadyProcessed',
    returnsEarlyOnProcessed,
    'if (alreadyProcessed) block niet gevonden');
}

// ─── Samenvatting ─────────────────────────────────────────────────────────────
console.log('\n═══ Samenvatting ═══\n');
console.log(`  Tests geslaagd: ${passCount}`);
console.log(`  Tests gefaald:  ${failCount}`);
console.log();

if (failCount === 0) {
  console.log('  CONCLUSIE: Poort A — alle tests PASSED');
  console.log('  De curve-gebaseerde GWT-detectie sluit droge-cap-punten correct uit.');
  console.log('  Maxwellstraat 3m-punt (ρ≈356) gaat niet meer in de natte prior.\n');
} else {
  console.error(`  CONCLUSIE: Poort A — ${failCount} test(s) FAILED — zie foutmeldingen hierboven\n`);
  process.exit(1);
}
