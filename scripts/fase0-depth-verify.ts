/**
 * Fase 0 — Depth consistency check.
 *
 * Vraag: als de tool de BRO-ρ gebruikt (met de gecorrigeerde rhoWet/rhoDry),
 * welke diepte raadt hij dan aan voor dezelfde weerstandsdoelen die veldmonteurs
 * ook werkelijk gemeten hebben? En hoeveel wijkt die aanbeveling af van de
 * werkelijk geslagen diepte?
 *
 * Werkwijze per meetpunt (depthM, rMeasured):
 *   1. Gebruik rMeasured als targetResistance.
 *   2. Laat calcDiepte de diepte zoeken die die weerstand geeft.
 *   3. Vergelijk aanbevolen diepte met de werkelijke meetdiepte.
 *   4. Een aanbevolen diepte > werkelijke diepte = conservatief (tool adviseert meer).
 *      Een aanbevolen diepte < werkelijke diepte = optimistisch (tool adviseert minder).
 */

import { calcDiepte, calcRhoEffective } from '../lib/calculations';
import { resolveRhoWet } from '../lib/pipeline/rho-priors';
import { FIELD_LOCATIONS } from '../lib/calibration/field-data';
import { readFileSync, existsSync } from 'fs';

const CACHE_DIR = '.calibration-cache';
const ROD_D = 0.014;

function log(s: string) { process.stderr.write(s + '\n'); }
function section(t: string) { log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`); }

// Laad BRO-cache zodat we exact dezelfde data gebruiken als de fase0-harness.
function loadCache(id: string) {
  const path = `${CACHE_DIR}/${id}.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Dezelfde dominante lithoClass als in fase0-harness:
function dominantLithoClass(broResult: { samples: { lithoClass: number }[] }): number {
  const counts: Record<number, number> = {};
  for (const s of broResult.samples) counts[s.lithoClass] = (counts[s.lithoClass] ?? 0) + 1;
  return parseInt(Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? '3');
}

// Importeer lithoClassToRhoDry voor rhoDry
import { lithoClassToRhoDry } from '../lib/calculations';

section('Fase 0 — Diepteconsistentiecheck');
log('  Vraag: welke diepte raadt de GECORRIGEERDE tool aan voor de exact gemeten weerstandswaarden?');
log('  Een positieve afwijking (aanbevolen > werkelijk) = conservatief = veilig maar duurder.');
log('  Een negatieve afwijking (aanbevolen < werkelijk) = optimistisch = riskant.');
log('');

const results: { id: string; label: string; points: { depthM: number; rMeasured: number; rhoWet: number; rhoDry: number; rhoEff: number; rPredAtDepth: number; depthToolAdvises: number; deltaM: number; pct: number }[] }[] = [];

for (const loc of FIELD_LOCATIONS) {
  const bro = loadCache(loc.id);
  if (!bro) {
    log(`  ✗  ${loc.label}: geen cache — voer eerst 'npm run calibrate:fase0' uit`);
    continue;
  }

  const lc       = dominantLithoClass(bro);
  const gwDepthM = bro.groundwaterDepth ?? loc.groundwaterDepthM;
  const rhoDry   = lithoClassToRhoDry(lc);
  const rhoWet   = resolveRhoWet(lc, bro.dominantRho);
  const rho      = bro.dominantRho; // rho passed to calcDiepte (iterative basis)

  section(`${loc.label}  lithoClass=${lc}  rhoDry=${rhoDry}  rhoWet=${rhoWet}  gw=${gwDepthM.toFixed(2)} m`);
  log('  diepteM | R_gemeten | R_pred@diepte | tool_adviseert | afwijking     | %');
  log('  ' + '─'.repeat(72));

  const points: typeof results[0]['points'] = [];

  for (const { depthM, rMeasured } of loc.depthCurve) {
    // R dat het model voorspelt bij de WERKELIJKE meetdiepte:
    const rhoEff = calcRhoEffective(rhoDry, rhoWet, gwDepthM, depthM);
    const rPredAtDepth = (rhoEff / (2 * Math.PI * depthM)) * Math.log((4 * depthM) / ROD_D);

    // Welke diepte raadt de tool aan voor rMeasured als doel?
    const res = calcDiepte({ rho, targetResistance: rMeasured, gwDepth: gwDepthM, rhoDry, rhoWet });
    const depthToolAdvises = res.depth;

    const deltaM = depthToolAdvises - depthM;
    const pct    = (deltaM / depthM) * 100;

    const sign = deltaM >= 0 ? '+' : '';
    log(
      `  ${String(depthM).padEnd(8)}| ${rMeasured.toFixed(2).padEnd(10)}| ` +
      `${rPredAtDepth.toFixed(2).padEnd(14)}| ${depthToolAdvises.toFixed(2).padEnd(15)}| ` +
      `${sign}${deltaM.toFixed(2)} m`.padEnd(15) + `| ${sign}${pct.toFixed(0)}%`,
    );

    points.push({ depthM, rMeasured, rhoWet, rhoDry, rhoEff, rPredAtDepth, depthToolAdvises, deltaM, pct });
  }

  results.push({ id: loc.id, label: loc.label, points });
}

section('Samenvatting');
log('  ID                    | geoMeanFactor (pred/werkelijk) | oordeel');
log('  ' + '─'.repeat(65));
for (const r of results) {
  const logFactors = r.points.map(p => Math.log(p.depthToolAdvises / p.depthM));
  const geoMean    = Math.exp(logFactors.reduce((a, b) => a + b, 0) / logFactors.length);
  const pct        = ((geoMean - 1) * 100).toFixed(0);
  const sign       = geoMean >= 1 ? '+' : '';
  let oordeel = geoMean < 0.9 ? '⚠ optimistisch (te ondiep)' :
                geoMean > 2.0 ? '⚠ conservatief (>2× te diep)' :
                geoMean > 1.5 ? '△ conservatief (1.5–2× te diep)' :
                geoMean > 1.1 ? '✓ licht conservatief' :
                                '✓ goed';
  log(`  ${r.id.padEnd(22)}| ${sign}${pct}%`.padEnd(36) + `| ${oordeel}`);
}
log('');
log('  Noot: licht conservatief = wenselijk (veiligheidsrichting). Poort-2 gate: geoMean ≤ +30%.');

const MAX_GEOMEAN = 1.30;
if (results.length === 0) {
  log('\n  GATE SKIP: geen BRO-cache — voer eerst npm run calibrate:fase0 uit.');
  process.exit(0);
}

let gateFailed = false;
for (const r of results) {
  const logFactors = r.points.map(p => Math.log(p.depthToolAdvises / p.depthM));
  const geoMean = Math.exp(logFactors.reduce((a, b) => a + b, 0) / logFactors.length);
  if (geoMean > MAX_GEOMEAN) {
    gateFailed = true;
    log(`\n  GATE FAIL: ${r.id} geoMean=${((geoMean - 1) * 100).toFixed(0)}% > +${((MAX_GEOMEAN - 1) * 100).toFixed(0)}%`);
  }
}

if (gateFailed) {
  log('\n  gate:depth FAILED — zie docs/phased-gates.md Poort 2');
  process.exit(1);
}
log('\n  gate:depth PASSED');
process.exit(0);
