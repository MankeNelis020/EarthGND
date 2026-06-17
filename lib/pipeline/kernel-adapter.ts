/**
 * Stage 6 — Kernel adapter (thin wrapper).
 *
 * Calls the existing, unchanged kernel functions (calcDiepte, calcLint, calcParallelRa, etc.)
 * from lib/calculations.ts. The kernel is a pure function and receives ONLY a
 * ValidatedDiepteInput — no UI, credit, fallback, or confidence logic.
 *
 * This file is the single place that knows how to translate ValidatedDiepteInput
 * into kernel calls. The kernel itself is never modified.
 */

import {
  calcDiepte,
  calcLint,
  calcParallelRa,
  calcCorrosionClass,
  calcDiepteRiskClass,
  lithoClassToRhoDry,
  lithoClassToRhoWet,
  calcRhoEffective,
  type DiepteResult,
  type LintResult,
  type RiskClassResult,
  type CorrosionClass,
} from '@/lib/calculations';
import type { ValidatedDiepteInput } from './parse';

const ROD_DIAMETER = 0.014;

export interface ParallelAdvice {
  aantalPennen: number;
  minAfstand:   number;
  rParallel:    number;
  rSingle:      number;
}

export interface KernelResult {
  scenarios: {
    gunstig:   DiepteResult | LintResult;
    gemiddeld: DiepteResult | LintResult;
    ongunstig: DiepteResult | LintResult;
  };
  electrodeType: 'pen' | 'lint';
  rhoDry:        number;
  rhoWet:        number;
  gwGunstig:     number;
  gwGemiddeld:   number;
  gwOngunstig:   number;
  riskClass:     RiskClassResult;
  corrosionClass: CorrosionClass;
  parallelAdvice: ParallelAdvice | null;
}

export function runKernel(input: ValidatedDiepteInput): KernelResult {
  const { rho, targetResistance, groundwaterDepth, ph, electrodeType,
          lintBurialDepth, lintConductorDiameter,
          lithoClass, rhoDryOverride, hasBroProfile } = input;

  // ─── Two-layer ρ ──────────────────────────────────────────────────────────
  const rhoDry = rhoDryOverride ?? (lithoClass ? lithoClassToRhoDry(lithoClass) : Math.round(rho * 2.2));
  const rhoWet = hasBroProfile  ? rho : (lithoClass ? lithoClassToRhoWet(lithoClass) : Math.round(rho * 0.45));

  // ─── Seasonal GWT offsets ─────────────────────────────────────────────────
  const gwGunstig   = groundwaterDepth;
  const gwGemiddeld = groundwaterDepth + 1.5;
  const gwOngunstig = groundwaterDepth + 3.0;

  // ─── Scenarios ────────────────────────────────────────────────────────────
  let scenarios: KernelResult['scenarios'];

  if (electrodeType === 'lint') {
    const burial = lintBurialDepth;
    scenarios = {
      gunstig:   calcLint({ rho: burial < gwGunstig   ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      gemiddeld: calcLint({ rho: burial < gwGemiddeld ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      ongunstig: calcLint({ rho: burial < gwOngunstig ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
    };
  } else {
    scenarios = {
      gunstig:   calcDiepte({ rho, targetResistance, gwDepth: gwGunstig,   rhoDry, rhoWet }),
      gemiddeld: calcDiepte({ rho, targetResistance, gwDepth: gwGemiddeld, rhoDry, rhoWet }),
      ongunstig: calcDiepte({ rho, targetResistance, gwDepth: gwOngunstig, rhoDry, rhoWet }),
    };
  }

  const gemiddeld    = scenarios.gemiddeld as { depth?: number; length?: number; achievedResistance: number };
  const primaryDim   = gemiddeld.depth ?? gemiddeld.length ?? 0;

  const riskClass    = calcDiepteRiskClass({ rho, groundwaterDepth, ph, depth: primaryDim });
  const corrosionClass = calcCorrosionClass(ph);

  // ─── Parallel advice (pen only, > 12 m) ──────────────────────────────────
  let parallelAdvice: ParallelAdvice | null = null;
  if (electrodeType === 'pen' && primaryDim > 12) {
    const n = primaryDim > 20 ? 3 : 2;
    const rhoEff = calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, primaryDim);
    const pa = calcParallelRa(rhoEff, primaryDim, ROD_DIAMETER, n);
    parallelAdvice = { aantalPennen: n, minAfstand: pa.spacingMin, rParallel: pa.rParallel, rSingle: pa.rSingle };
  }

  return { scenarios, electrodeType, rhoDry, rhoWet, gwGunstig, gwGemiddeld, gwOngunstig, riskClass, corrosionClass, parallelAdvice };
}
