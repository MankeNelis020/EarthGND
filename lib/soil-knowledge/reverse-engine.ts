/**
 * Reverse engine: van veldmeting naar bodembewijs.
 *
 * Stap 1 — deriveRhoApparent: R(L) → ρ_apparent via Dwight-inversie
 * Stap 2 — estimateClassDistribution: ρ_apparent → P(k) per lithoClass
 * Stap 3 — analyzeDepthCurve: volledige dieptecurve → AnalyzedDepthPoint[]
 * Stap 4 — detectGroundwaterBoundary: afleiding GWT uit ρ-verloop (geen handmatig veld)
 *
 * Architectuurconstraint: de kernel (lib/calculations.ts) wordt NOOIT gewijzigd.
 * De formule hier is identiek aan invertToRhoApparent() in fase0-counterfactual.ts.
 */

import { LITERATURE_PRIOR, CLASS_LOG_SIGMA } from './priors';
import type { AnalyzedDepthPoint, ClassDistribution } from './types';
import {
  DEFAULT_ELECTRODE_DIAMETER_M,
  mmToRodDiameterM,
  normalizeElectrodeDiameterMm,
} from '@/lib/electrode-diameter';

/**
 * Berekent schijnbare bodemweerstand (ρ_apparent) uit gemeten staafweerstand R op diepte L.
 *
 * Dwight-inversie ZONDER −1 term (kernel-consistent).
 *
 * ρ_apparent = R × 2πL / ln(4L/d)
 */
export function deriveRhoApparent(
  rMeasured: number,
  depthM: number,
  rodDiameterM: number = DEFAULT_ELECTRODE_DIAMETER_M,
): number {
  if (rMeasured <= 0 || depthM <= 0 || rodDiameterM <= 0) return NaN;
  return (rMeasured * 2 * Math.PI * depthM) / Math.log((4 * depthM) / rodDiameterM);
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

/**
 * Segment-analyse: Ω-daling per meter tussen opeenvolgende dieptepunten.
 * Gebruikt voor bodeminterpretatie in opleverrapport.
 */
export interface DepthSegmentAnalysis {
  fromDepthM:     number;
  toDepthM:       number;
  deltaRa:        number;
  deltaDepthM:    number;
  ohmPerMeter:    number;
  rhoAtToDepth:   number;
  dominantClass:  number;
  dominantLabel:  string;
  classDist:      ClassDistribution;
}

const LITHO_LABELS: Record<number, string> = {
  1: 'klei', 2: 'leem', 3: 'zand', 4: 'grind', 5: 'veen',
};

function dominantClassFromDist(dist: ClassDistribution): { k: number; label: string } {
  let bestK = 3;
  let bestP = 0;
  for (const [kStr, p] of Object.entries(dist)) {
    if ((p ?? 0) > bestP) {
      bestP = p ?? 0;
      bestK = parseInt(kStr);
    }
  }
  return { k: bestK, label: LITHO_LABELS[bestK] ?? 'onbekend' };
}

export function analyzeDepthSegments(
  depthCurve: Array<{ depth: number; ra: number }>,
  gwDepthM: number,
  electrodeDiameterMm?: number,
): DepthSegmentAnalysis[] {
  const points = analyzeDepthCurve(depthCurve, gwDepthM, electrodeDiameterMm);
  if (points.length < 2) return [];

  const segments: DepthSegmentAnalysis[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const deltaDepth = cur.depthM - prev.depthM;
    if (deltaDepth <= 0) continue;

    const prevRa = depthCurve.find(p => p.depth === prev.depthM)?.ra ?? 0;
    const curRa = depthCurve.find(p => p.depth === cur.depthM)?.ra ?? 0;
    const deltaRa = curRa - prevRa;
    const ohmPerMeter = deltaRa / deltaDepth;
    const dom = dominantClassFromDist(cur.classDist);

    segments.push({
      fromDepthM:    prev.depthM,
      toDepthM:      cur.depthM,
      deltaRa:       Math.round(deltaRa * 1000) / 1000,
      deltaDepthM:   deltaDepth,
      ohmPerMeter:   Math.round(ohmPerMeter * 1000) / 1000,
      rhoAtToDepth:  Math.round(cur.rhoApparent * 10) / 10,
      dominantClass: dom.k,
      dominantLabel: dom.label,
      classDist:     cur.classDist,
    });
  }
  return segments;
}

export function analyzeDepthCurve(
  depthCurve: Array<{ depth: number; ra: number }>,
  gwDepthM: number,
  electrodeDiameterMm: number = normalizeElectrodeDiameterMm(undefined),
): AnalyzedDepthPoint[] {
  const rodDiameterM = mmToRodDiameterM(normalizeElectrodeDiameterMm(electrodeDiameterMm));
  return depthCurve
    .filter(pt => pt.depth > 0 && pt.ra > 0 && isFinite(pt.depth) && isFinite(pt.ra))
    .map(pt => {
      const rhoApparent = deriveRhoApparent(pt.ra, pt.depth, rodDiameterM);
      return {
        depthM: pt.depth,
        rhoApparent,
        // Strictly less than: boundary depth zelf valt in 'wet' (op of onder GWT)
        zone: pt.depth < gwDepthM ? 'dry' : 'wet',
        classDist: isFinite(rhoApparent)
          ? estimateClassDistribution(rhoApparent)
          : { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 },
      } satisfies AnalyzedDepthPoint;
    });
}

// ─── GWT-detectie uit ρ-curve ─────────────────────────────────────────────────

const PLATEAU_STABLE_BAND = 0.20; // ±20% voor stabiel plateau
const PLATEAU_ENTRY_RATIO = 1.30; // ρ ≤ 1.3× plateau → nat
const DRY_CAP_RATIO       = 1.50; // eerste ρ > 1.5× plateau → droge cap aanwezig

/** Resultaat van GWT-detectie uit de meetcurve. */
export interface GwBoundaryResult {
  gwDepthM:              number;                          // afgeleid of fallback GWT (m)
  gw_source:             'curve' | 'regional' | 'all_wet';
  gw_confidence:         'high' | 'medium' | 'low';
  plateauRho:            number | null;                   // gedetecteerde natte ρ (Ω·m)
  flaggedMonotoneDepths: number[];                        // diepten met niet-monotone R-stijging
}

function arrayMedian(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function gwFallback(
  rhos: number[],
  broGwDepthM: number | null,
  flaggedMonotoneDepths: number[],
): GwBoundaryResult {
  // Lage, uniforme ρ → duidelijk volledig nat (bv. Lelystad ρ~6)
  if (rhos.length >= 1) {
    const minRho = Math.min(...rhos);
    const maxRho = Math.max(...rhos);
    if (maxRho < 30 && (minRho <= 0 || maxRho / minRho < 1.5)) {
      return { gwDepthM: 0, gw_source: 'all_wet', gw_confidence: 'medium', plateauRho: null, flaggedMonotoneDepths };
    }
  }
  if (broGwDepthM != null && broGwDepthM > 0) {
    return { gwDepthM: broGwDepthM, gw_source: 'regional', gw_confidence: 'low', plateauRho: null, flaggedMonotoneDepths };
  }
  return { gwDepthM: 0, gw_source: 'all_wet', gw_confidence: 'low', plateauRho: null, flaggedMonotoneDepths };
}

/**
 * Leidt de grondwatergrens af uit de vorm van de ρ-curve — geen handmatig veld nodig.
 *
 * Detecteert: droge cap + nat plateau → grens is shallowest diepte waar ρ afvlakt.
 * Fallback-hiërarchie (nooit stil 2,0 m):
 *   lage uniforme ρ → all_wet (medium) · BRO-gwDepth → regional (low) · else → all_wet (low)
 *
 * @param broGwDepthM  BRO-grondwaterstand als regionale fallback (nullable)
 */
export function detectGroundwaterBoundary(
  depthCurve: Array<{ depth: number; ra: number }>,
  broGwDepthM: number | null = null,
  rodDiameterM: number = DEFAULT_ELECTRODE_DIAMETER_M,
): GwBoundaryResult {
  const sorted = [...depthCurve]
    .filter(pt => pt.depth > 0 && pt.ra > 0 && isFinite(pt.depth) && isFinite(pt.ra))
    .sort((a, b) => a.depth - b.depth);

  if (sorted.length === 0) return gwFallback([], broGwDepthM, []);

  // Stap 0: monotonie-check — R moet dalen met diepte
  const flaggedMonotoneDepths: number[] = [];
  const valid: Array<{ depth: number; rho: number }> = [];
  let prevRa = -Infinity;
  for (const pt of sorted) {
    if (prevRa > 0 && pt.ra > prevRa) {
      flaggedMonotoneDepths.push(pt.depth);
      continue;
    }
    const rho = deriveRhoApparent(pt.ra, pt.depth, rodDiameterM);
    if (!isFinite(rho) || rho <= 0) continue;
    valid.push({ depth: pt.depth, rho });
    prevRa = pt.ra;
  }

  if (valid.length < 2) {
    return gwFallback(valid.map(p => p.rho), broGwDepthM, flaggedMonotoneDepths);
  }

  // Stap 1: plateau bepalen vanuit diepste stabiele punten
  let plateauRho: number | null = null;
  for (let n = Math.min(3, valid.length); n >= 2; n--) {
    const tail = valid.slice(-n).map(p => p.rho);
    const med = arrayMedian(tail);
    if (tail.every(r => Math.abs(r - med) / med <= PLATEAU_STABLE_BAND)) {
      plateauRho = med;
      break;
    }
  }

  if (plateauRho == null || plateauRho <= 0) {
    return gwFallback(valid.map(p => p.rho), broGwDepthM, flaggedMonotoneDepths);
  }

  const threshold = plateauRho * PLATEAU_ENTRY_RATIO;

  // Stap 2: grensdiepte = shallowest diepte waar ρ ≤ threshold en daarna blijft
  let boundaryIdx: number | null = null;
  for (let i = 0; i < valid.length; i++) {
    if (valid[i].rho <= threshold) {
      if (valid.slice(i).every(p => p.rho <= threshold)) {
        boundaryIdx = i;
        break;
      }
    }
  }

  if (boundaryIdx === null) {
    return gwFallback(valid.map(p => p.rho), broGwDepthM, flaggedMonotoneDepths);
  }

  // Stap 3: al nat vanaf eerste punt?
  const firstRho = valid[0].rho;
  if (boundaryIdx === 0 && firstRho <= threshold) {
    return { gwDepthM: 0, gw_source: 'all_wet', gw_confidence: 'high', plateauRho, flaggedMonotoneDepths };
  }

  const hasDryCap = firstRho > plateauRho * DRY_CAP_RATIO;
  return {
    gwDepthM:      valid[boundaryIdx].depth,
    gw_source:     'curve',
    gw_confidence: hasDryCap ? 'high' : 'medium',
    plateauRho,
    flaggedMonotoneDepths,
  };
}
