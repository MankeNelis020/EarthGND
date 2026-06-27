/**
 * Reverse engine: van veldmeting naar bodembewijs.
 *
 * Stap 1 — deriveRhoApparent: R(L) → ρ_apparent via Dwight-inversie
 * Stap 2 — estimateClassDistribution: ρ_apparent → P(k) per lithoClass
 * Stap 3 — analyzeDepthCurve: volledige dieptecurve → AnalyzedDepthPoint[]
 *
 * Architectuurconstraint: de kernel (lib/calculations.ts) wordt NOOIT gewijzigd.
 * De formule hier is identiek aan invertToRhoApparent() in fase0-counterfactual.ts.
 */

import { LITERATURE_PRIOR, CLASS_LOG_SIGMA } from './priors';
import type { AnalyzedDepthPoint, ClassDistribution } from './types';

const ROD_DIAMETER = 0.014; // m — identiek aan kernel-adapter.ts ROD_DIAMETER

/**
 * Berekent schijnbare bodemweerstand (ρ_apparent) uit gemeten staafweerstand R op diepte L.
 *
 * Dwight-inversie ZONDER −1 term (kernel-consistent).
 * De ~4% afwijking t.o.v. exacte Dwight-formule zit in alle residuen — wordt niet gecorrigeerd.
 *
 * ρ_apparent = R × 2πL / ln(4L/d)
 */
export function deriveRhoApparent(rMeasured: number, depthM: number): number {
  if (rMeasured <= 0 || depthM <= 0) return NaN;
  return (rMeasured * 2 * Math.PI * depthM) / Math.log((4 * depthM) / ROD_DIAMETER);
}

/**
 * Schat de kansverdeling P(k | ρ_apparent) over alle lithoClasses.
 *
 * Gebruikt lognormale likelihood per klasse:
 *   P(ρ | k) ∝ lognormaal(μ = LITERATURE_PRIOR[k].mu, σ_log = CLASS_LOG_SIGMA[k])
 *
 * GEEN harde classificatie — volledige verdeling bewaren.
 * Iedere meting draagt proportioneel bij aan ALLE klassen.
 *
 * Grind (k=4) krijgt een lage prior-kans door hoge log-sigma — bewijs wordt
 * WEL opgeslagen maar NIET gebruikt voor learning (learning_blocked in DB).
 */
export function estimateClassDistribution(rhoApparent: number): ClassDistribution {
  if (rhoApparent <= 0 || !isFinite(rhoApparent)) {
    // Uniforme verdeling als fallback
    return { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 };
  }

  const classes = Object.keys(LITERATURE_PRIOR).map(Number);
  const logRho = Math.log(rhoApparent);
  const likelihoods: Record<number, number> = {};
  let total = 0;

  for (const k of classes) {
    const { mu } = LITERATURE_PRIOR[k];
    const logSigma = CLASS_LOG_SIGMA[k] ?? 0.50;
    const logMu = Math.log(mu);

    // Lognormale likelihood (kern — normalisatieconstante valt weg na normalisatie)
    const exponent = -0.5 * ((logRho - logMu) / logSigma) ** 2;
    // Deel door (rhoApparent × logSigma) voor correcte lognormale vorm
    const likelihood = Math.exp(exponent) / (rhoApparent * logSigma);

    likelihoods[k] = Math.max(likelihood, 1e-12); // voorkom exacte nul
    total += likelihoods[k];
  }

  if (total === 0) return { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 };

  return Object.fromEntries(classes.map(k => [k, likelihoods[k] / total]));
}

/**
 * Verwerkt een volledige dieptecurve tot AnalyzedDepthPoint[].
 *
 * Scheidt nat (onder GWT) van droog (boven GWT).
 * Filtert ongeldige punten (depth ≤ 0, ra ≤ 0, NaN resultaat).
 *
 * @param depthCurve  [{depth, ra}] — diepte in m, weerstand in Ω
 * @param gwDepthM    grondwaterdiepte in m (gebruik field_gw_depth als beschikbaar)
 */
export function analyzeDepthCurve(
  depthCurve: Array<{ depth: number; ra: number }>,
  gwDepthM: number,
): AnalyzedDepthPoint[] {
  return depthCurve
    .filter(pt => pt.depth > 0 && pt.ra > 0 && isFinite(pt.depth) && isFinite(pt.ra))
    .map(pt => {
      const rhoApparent = deriveRhoApparent(pt.ra, pt.depth);
      return {
        depthM: pt.depth,
        rhoApparent,
        zone: pt.depth <= gwDepthM ? 'dry' : 'wet',
        classDist: isFinite(rhoApparent)
          ? estimateClassDistribution(rhoApparent)
          : { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 },
      } satisfies AnalyzedDepthPoint;
    });
}
