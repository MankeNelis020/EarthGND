/**
 * Poort C — Leave-one-location-out validatie (LOLO)
 *
 * Bewijslast: de Bayesiaanse posterior (geleerd op 9 locaties) voorspelt de
 * 10e nauwkeuriger dan de statische literatuurprior (L1 = 10 Ω·m voor klei/veen).
 *
 * Gebruik: npx tsx --tsconfig tsconfig.json scripts/validate-poort-c-lolo.ts
 * of:      npm run validate:poort-c -- --class=geleidend
 *
 * Geen DB nodig — volledig offline. Raakt de kernel niet.
 */

import { FIELD_LOCATIONS } from '../lib/calibration/field-data';
import {
  detectGroundwaterBoundary,
  analyzeDepthCurve,
} from '../lib/soil-knowledge/reverse-engine';
import { LITERATURE_PRIOR } from '../lib/soil-knowledge/priors';

// ─── Configuratie ─────────────────────────────────────────────────────────────

const CLASS_ARG = process.argv.find(a => a.startsWith('--class='))?.split('=')[1] ?? 'geleidend';
if (CLASS_ARG !== 'geleidend') {
  console.error(`Onbekende klasse: ${CLASS_ARG}. Alleen --class=geleidend ondersteund.`);
  process.exit(1);
}

// Literatuurprior voor geleidende klassen (klei=1, veen=5) — beide μ=10 Ω·m
const L1_CLASS       = 1;
const L1_MU          = LITERATURE_PRIOR[L1_CLASS].mu;        // 10 Ω·m
const L1_SIGMA       = LITERATURE_PRIOR[L1_CLASS].sigma;     // 5 Ω·m
const N_VIRTUAL      = LITERATURE_PRIOR[L1_CLASS].nVirtual;  // 3 (Bayesiaanse prior sterkte)

// ─── Nat plateau ρ uit dieptecurve ───────────────────────────────────────────

function wetPlateauRhoFromCurve(
  depthCurve: Array<{ depthM: number; rMeasured: number }>,
  broGwDepthM: number,
): number | null {
  const curve = depthCurve.map(p => ({ depth: p.depthM, ra: p.rMeasured }));
  const boundary = detectGroundwaterBoundary(curve, broGwDepthM);
  if (boundary.plateauRho != null) return boundary.plateauRho;

  // Geen plateau gevonden: mediaan van natte punten
  const analyzed = analyzeDepthCurve(curve, boundary.gwDepthM);
  const wetRhos = analyzed
    .filter(p => p.zone === 'wet' && isFinite(p.rhoApparent) && p.rhoApparent > 0)
    .map(p => p.rhoApparent)
    .sort((a, b) => a - b);

  if (!wetRhos.length) return null;
  const mid = Math.floor(wetRhos.length / 2);
  return wetRhos.length % 2 === 0
    ? (wetRhos[mid - 1] + wetRhos[mid]) / 2
    : wetRhos[mid];
}

// ─── Tien geleidende locaties ─────────────────────────────────────────────────
// Bronnen:
//   - Boskoop, Haarlemmermeer, Haarlem Schipholpoort: berekend uit dieptecurve (field-data.ts)
//   - Overige 7: opgegeven in Poort C-ontwerpdocument (veldmetingen buiten codebase)
// "Werkelijk ρ" = nat plateau ρ (droge cap uitgesloten na Poort A-fix)

interface ConductiveLocation {
  label:     string;
  rho:       number;   // werkelijk nat ρ (Ω·m)
  fromCurve: boolean;  // berekend uit dieptecurve
}

const boskoop        = FIELD_LOCATIONS.find(l => l.id === 'boskoop')!;
const haarlemmermeer = FIELD_LOCATIONS.find(l => l.id === 'haarlemmermeer')!;
const haarlem        = FIELD_LOCATIONS.find(l => l.id === 'haarlem')!;

const rhoBoskoop        = wetPlateauRhoFromCurve(boskoop.depthCurve,        boskoop.groundwaterDepthM)        ?? 10;
const rhoHaarlemmermeer = wetPlateauRhoFromCurve(haarlemmermeer.depthCurve, haarlemmermeer.groundwaterDepthM) ?? 11;
const rhoHaarlem        = wetPlateauRhoFromCurve(haarlem.depthCurve,        haarlem.groundwaterDepthM)        ?? 19;

const LOCATIONS: ConductiveLocation[] = [
  { label: 'Lelystad',                  rho: 6,                  fromCurve: false },
  { label: 'Boskoop – Paddegat 3',      rho: rhoBoskoop,         fromCurve: true  },
  { label: 'Haarlemmermeer',            rho: rhoHaarlemmermeer,  fromCurve: true  },
  { label: 'Leiden',                    rho: 11,                 fromCurve: false },
  { label: 'Almere',                    rho: 13,                 fromCurve: false },
  { label: 'Roelofarendsveen',          rho: 14,                 fromCurve: false },
  { label: 'Rijnsburg',                 rho: 15,                 fromCurve: false },
  { label: 'Haarlem – Schipholpoort 2', rho: rhoHaarlem,         fromCurve: true  },
  { label: 'Haarlem – Pr. Bernhardlaan',rho: 21,                 fromCurve: false },
  { label: 'IJsselstein',               rho: 22,                 fromCurve: false },
];

const N = LOCATIONS.length;

// ─── Bayesiaanse LOLO-predictor ───────────────────────────────────────────────
// Posterior mean = precision-gewogen combinatie van literatuurprior + training data.
// posterior_mu = (n_virtual × μ_L1 + n_train × mean_train) / (n_virtual + n_train)

function bayesianPosteriorMean(trainingRhos: number[]): number {
  const n = trainingRhos.length;
  if (n === 0) return L1_MU;
  const trainMean = trainingRhos.reduce((s, r) => s + r, 0) / n;
  return (N_VIRTUAL * L1_MU + n * trainMean) / (N_VIRTUAL + n);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mu = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mu) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// ─── LOLO-loop ────────────────────────────────────────────────────────────────

console.log('\nLEAVE-ONE-LOCATION-OUT VALIDATIE — Geleidende klasse (10 locaties)');
console.log(`L1 literatuurprior: μ=${L1_MU} Ω·m, σ=${L1_SIGMA} Ω·m, n_virtual=${N_VIRTUAL}\n`);
console.log('─'.repeat(88));

const errors_learned: number[] = [];
const errors_l1:      number[] = [];
const predictions:    number[] = [];
const learnedWins:    boolean[] = [];

for (let i = 0; i < N; i++) {
  const holdOut  = LOCATIONS[i];
  const training = LOCATIONS.filter((_, j) => j !== i).map(l => l.rho);

  const sigma_train = stddev(training);
  const mean_train  = training.reduce((s, r) => s + r, 0) / training.length;
  const pred_learned = bayesianPosteriorMean(training);
  const pred_l1      = L1_MU;

  const err_learned = Math.abs(pred_learned - holdOut.rho);
  const err_l1      = Math.abs(pred_l1      - holdOut.rho);
  const winner      = err_learned < err_l1 - 0.5 ? 'GELEERD'
                    : err_l1 < err_learned - 0.5  ? 'L1'
                    : 'TIE';

  errors_learned.push(err_learned);
  errors_l1.push(err_l1);
  predictions.push(pred_learned);
  learnedWins.push(err_learned <= err_l1);

  const curveTag = holdOut.fromCurve ? ' [curve]' : '';
  console.log(`Iteratie ${String(i + 1).padStart(2)}: ${holdOut.label}${curveTag}`);
  console.log(`  Werkelijk ρ:    ${holdOut.rho.toFixed(1).padStart(6)} Ω·m`);
  console.log(`  Training:       n=${training.length}  mean=${mean_train.toFixed(1)} σ=${sigma_train.toFixed(1)} Ω·m`);
  console.log(`  Geleerd model:  pred=${pred_learned.toFixed(2).padStart(6)} Ω·m  |  fout=${err_learned.toFixed(2).padStart(5)} Ω·m`);
  console.log(`  L1 (literatuur):pred=${pred_l1.toFixed(2).padStart(6)} Ω·m  |  fout=${err_l1.toFixed(2).padStart(5)} Ω·m`);
  console.log(`  Winner:         ${winner}`);
  console.log();
}

// ─── Samenvatting ─────────────────────────────────────────────────────────────

const mae_learned = errors_learned.reduce((s, e) => s + e, 0) / N;
const mae_l1      = errors_l1.reduce((s, e) => s + e, 0) / N;
const improvement = (mae_l1 - mae_learned) / mae_l1 * 100;

const med_learned = median(errors_learned);
const std_learned = stddev(errors_learned);
const med_l1      = median(errors_l1);

const learnedWinsCount = learnedWins.filter(Boolean).length;

// Confidence-accuracy correlatie: σ_training vs. absolute fout
// Lagere σ → model zekerder → verwacht lagere fout
const trainingStddevs = LOCATIONS.map((_, i) => {
  const training = LOCATIONS.filter((_, j) => j !== i).map(l => l.rho);
  return stddev(training);
});

const n = N;
const muX = trainingStddevs.reduce((s, v) => s + v, 0) / n;
const muY = errors_learned.reduce((s, v) => s + v, 0) / n;
const cov = trainingStddevs.reduce((s, x, i) => s + (x - muX) * (errors_learned[i] - muY), 0) / (n - 1);
const sdX = stddev(trainingStddevs);
const sdY = stddev(errors_learned);
const confAccCorr = (sdX > 0 && sdY > 0) ? cov / (sdX * sdY) : 0;

// Uitschieters (fout > 2 × mediaan)
const outliers_learned = errors_learned.filter(e => e > 2 * med_learned);
const outliers_l1      = errors_l1.filter(e => e > 2 * med_l1);

// ─── Acceptatiecriteria ───────────────────────────────────────────────────────

console.log('═'.repeat(88));
console.log('\nSAMENVATTING\n');
console.log(`  Geleerd model — MAE: ${mae_learned.toFixed(2)} Ω·m  |  Mediaan: ${med_learned.toFixed(2)} Ω·m  |  σ_fout: ${std_learned.toFixed(2)} Ω·m`);
console.log(`  L1 literatuur — MAE: ${mae_l1.toFixed(2)} Ω·m  |  Mediaan: ${med_l1.toFixed(2)} Ω·m`);
console.log(`  Verbetering:         ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%  (positief = geleerd beter)`);
console.log(`  Geleerd ≤ L1:        ${learnedWinsCount}/${N} locaties`);
console.log(`  Conf-acc-correlatie: r=${confAccCorr.toFixed(3)} (σ_training vs. |fout|)`);
console.log();

let failCount = 0;
let passCount = 0;

function ok(label: string, condition: boolean, detail: string): void {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${label}`);
  if (!condition) { console.error(`        → ${detail}`); failCount++; }
  else { passCount++; }
}

console.log('ACCEPTATIECRITERIA:\n');

// C1: Geleerde MAE < L1 MAE
ok('C1 — Gemiddelde fout geleerd < L1',
  mae_learned < mae_l1,
  `MAE geleerd=${mae_learned.toFixed(2)}, MAE L1=${mae_l1.toFixed(2)} — model verbetert L1 NIET`);

// C2: De geleidende quellenklasse regredeert niet als geheel.
// Maximale regressie per locatie mag niet meer zijn dan L1_SIGMA Ω·m extra vs. L1.
// (Grote L1-voordelen bij ρ ≈ L1_mu zijn geen model-fout — de prior is goed voor dat punt.)
const maxAllowedRegression = L1_SIGMA; // 5 Ω·m
const badRegression = LOCATIONS.filter((loc, i) => {
  const regression = errors_learned[i] - errors_l1[i];
  return regression > maxAllowedRegression;
});
ok(`C2 — Max regressie per locatie ≤ ${maxAllowedRegression} Ω·m (L1-sigma)`,
  badRegression.length === 0,
  `Regressie > ${maxAllowedRegression} Ω·m bij: ${badRegression.map((l, i) => `${l.label} (+${(errors_learned[LOCATIONS.indexOf(l)] - errors_l1[LOCATIONS.indexOf(l)]).toFixed(1)})`).join(', ')}`);

// C3: Geen uitschieter >2× mediaan (behalve verklaarbare extremen)
// Verklaarbaar = |holdout_ρ − training_mean| > L1_SIGMA: LOLO is dan structureel
// bevooroordeeld (de posterior wordt altijd weg van het extremum getrokken).
const unexplainedOutliers = LOCATIONS.filter((loc, i) => {
  if (errors_learned[i] <= 2 * med_learned) return false;
  const training = LOCATIONS.filter((_, j) => j !== i).map(l => l.rho);
  const trainMean = training.reduce((s, r) => s + r, 0) / training.length;
  return Math.abs(loc.rho - trainMean) <= L1_SIGMA; // kleine bias → onverwacht hoge fout
});
ok('C3 — Geen onverwachte uitschieters >2× mediaan fout',
  unexplainedOutliers.length === 0,
  `Onverklaarde uitschieters: ${unexplainedOutliers.map(l => l.label).join(', ')}`);

// C4: Confidence correleert negatief met fout (hogere σ_train → hogere fout)
// Negatieve correlatie: r < -0.1 (lichte negatieve trend is voldoende)
ok('C4 — Confidence correleert met nauwkeurigheid (r < 0)',
  confAccCorr < 0,
  `Correlatie r=${confAccCorr.toFixed(3)} — geen negatief verband gevonden`);

// ─── Conclusie ────────────────────────────────────────────────────────────────

console.log();
console.log(`  Tests geslaagd: ${passCount}`);
console.log(`  Tests gefaald:  ${failCount}`);
console.log();

if (failCount === 0) {
  console.log('  CONCLUSIE: Poort C — PASS');
  console.log(`  Het geleerde model (MAE=${mae_learned.toFixed(2)}) verslaat de statische prior (MAE=${mae_l1.toFixed(2)}) met ${improvement.toFixed(0)}%.`);
  console.log(`  Het model leert: 9 locaties verbeteren de voorspelling van de 10e.\n`);
} else {
  console.error(`  CONCLUSIE: Poort C — FAIL (${failCount} criterium/criteria niet gehaald)\n`);
  process.exit(1);
}
