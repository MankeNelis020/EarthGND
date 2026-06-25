/**
 * Stage 6 — Kernel adapter (thin wrapper).
 *
 * Calls the existing, unchanged kernel functions (calcDiepte, calcLint, calcParallelRa, etc.)
 * from lib/calculations.ts. The kernel is a pure function and receives ONLY a
 * ValidatedDiepteInput — no UI, credit, fallback, or confidence logic.
 *
 * This file is the single place that knows how to translate ValidatedDiepteInput
 * into kernel calls. The kernel itself is never modified.
 *
 * Driveability integration (2026-06):
 *   After computing z_req (Dwight solver), the adapter checks z_max for the chosen
 *   drijfmethode. If z_max.typical < z_req, rods are capped at z_max.typical and
 *   n parallel rods are computed to still reach targetResistance.
 *   parallelAdvice.reason distinguishes 'driveability' from 'resistance' triggers.
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
import { calcZMax, type DriveMethod, type ZMaxBand, type RefusalLayer } from './driveability';

const ROD_DIAMETER = 0.014;

export interface ParallelAdvice {
  aantalPennen:     number;
  minAfstand:       number;
  rParallel:        number;
  rSingle:          number;
  reason:           'resistance' | 'driveability';
  zMax?:            ZMaxBand;
  refusalLayer?:    RefusalLayer | null;
  targetUnreachable?: boolean;
}

export interface KernelResult {
  scenarios: {
    gunstig:   DiepteResult | LintResult;
    gemiddeld: DiepteResult | LintResult;
    ongunstig: DiepteResult | LintResult;
  };
  electrodeType:  'pen' | 'lint';
  rhoDry:         number;
  rhoWet:         number;
  gwGunstig:      number;
  gwGemiddeld:    number;
  gwOngunstig:    number;
  riskClass:      RiskClassResult;
  corrosionClass: CorrosionClass;
  parallelAdvice: ParallelAdvice | null;
  driveability?: {
    method:           DriveMethod;
    zMax:             ZMaxBand;
    refusalLayer:     RefusalLayer | null;
    isLimited:        boolean;
    requiresParallel: boolean;
  };
}

/** Iteratively find the minimum number of parallel rods at z_max that achieve targetR. */
function solveNRods(
  rhoEff:      number,
  zMax:        number,
  target:      number,
  diameter:    number,
  rhoDry:      number,
  rhoWet:      number,
  gwGemiddeld: number,
): { n: number; rParallel: number; rSingle: number; targetUnreachable: boolean } {
  // If 1 rod at Dwight-optimal depth (using two-layer ρ at gwGemiddeld) fits within zMax, use it.
  const single = calcDiepte({ rho: rhoEff, targetResistance: target, gwDepth: gwGemiddeld, rhoDry, rhoWet });
  if (single.depth <= zMax && single.achievedResistance <= target) {
    return { n: 1, rParallel: single.achievedResistance, rSingle: single.achievedResistance, targetUnreachable: false };
  }

  // Optimal depth exceeds zMax — compute resistance of 1 rod at exactly zMax.
  const rSingle = calcParallelRa(rhoEff, zMax, diameter, 1).rParallel;
  if (rSingle <= target) return { n: 1, rParallel: rSingle, rSingle, targetUnreachable: false };

  for (let n = 2; n <= 6; n++) {
    const pa = calcParallelRa(rhoEff, zMax, diameter, n);
    if (pa.rParallel <= target) {
      return { n, rParallel: pa.rParallel, rSingle, targetUnreachable: false };
    }
    if (n === 6) {
      return { n: 6, rParallel: pa.rParallel, rSingle, targetUnreachable: true };
    }
  }
  return { n: 1, rParallel: rSingle, rSingle, targetUnreachable: true };
}

export function runKernel(input: ValidatedDiepteInput): KernelResult {
  const { rho, targetResistance, groundwaterDepth, ph, electrodeType,
          lintBurialDepth, lintConductorDiameter,
          lithoClass, rhoDryOverride,
          drijfmethode, soilSamples } = input;

  // ─── Layered/two-layer ρ ──────────────────────────────────────────────────
  const rhoDry = rhoDryOverride ?? (lithoClass ? lithoClassToRhoDry(lithoClass) : Math.round(rho * 2.2));
  const rhoWet = lithoClass ? lithoClassToRhoWet(lithoClass) : Math.round(rho * 0.45);
  const layeredSamples = soilSamples && soilSamples.length > 0 ? soilSamples : undefined;

  // ─── Seasonal GWT offsets ─────────────────────────────────────────────────
  const gwGunstig   = groundwaterDepth;
  const gwGemiddeld = groundwaterDepth + 1.5;
  const gwOngunstig = groundwaterDepth + 3.0;

  // ─── Scenarios (uncapped — based purely on Dwight) ────────────────────────
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
      gunstig:   calcDiepte({ rho, targetResistance, gwDepth: gwGunstig,   rhoDry, rhoWet, soilSamples: layeredSamples }),
      gemiddeld: calcDiepte({ rho, targetResistance, gwDepth: gwGemiddeld, rhoDry, rhoWet, soilSamples: layeredSamples }),
      ongunstig: calcDiepte({ rho, targetResistance, gwDepth: gwOngunstig, rhoDry, rhoWet, soilSamples: layeredSamples }),
    };
  }

  const gemiddeld  = scenarios.gemiddeld as { depth?: number; length?: number; achievedResistance: number };
  const primaryDim = gemiddeld.depth ?? gemiddeld.length ?? 0;

  // ─── Driveability check (pen only, when method is known) ─────────────────
  let parallelAdvice: ParallelAdvice | null = null;
  let driveabilityInfo: KernelResult['driveability'] = undefined;

  if (electrodeType === 'pen' && drijfmethode) {
    const samples = (soilSamples && soilSamples.length > 0)
      ? soilSamples
      : (lithoClass ? [{ depth: primaryDim * 0.5, lithoClass }] : []);

    const drive = calcZMax(samples, drijfmethode, primaryDim);
    driveabilityInfo = { method: drijfmethode, zMax: drive.zMax, refusalLayer: drive.refusalLayer, isLimited: drive.isLimited, requiresParallel: drive.requiresParallel };

    if (drive.requiresParallel) {
      // Only cap and go parallel when even zMax.high is insufficient.
      // When isLimited but !requiresParallel, pushing deeper (typical→high) suffices.
      const zCapped  = drive.zMax.typical;
      const rhoEff   = calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, zCapped);
      const solved   = solveNRods(rhoEff, zCapped, targetResistance, ROD_DIAMETER, rhoDry, rhoWet, gwGemiddeld);
      const pa       = calcParallelRa(rhoEff, zCapped, ROD_DIAMETER, solved.n);

      parallelAdvice = {
        aantalPennen:     solved.n,
        minAfstand:       pa.spacingMin,
        rParallel:        Math.round(pa.rParallel * 100) / 100,
        rSingle:          Math.round(solved.rSingle * 100) / 100,
        reason:           'driveability',
        zMax:             drive.zMax,
        refusalLayer:     drive.refusalLayer,
        targetUnreachable: solved.targetUnreachable,
      };
    }
  }

  // ─── Resistance-based parallel advice (fallback when no driveability method,
  //     or as secondary check when driveability didn't trigger) ──────────────
  if (!parallelAdvice && electrodeType === 'pen' && primaryDim > 12) {
    const n      = primaryDim > 20 ? 3 : 2;
    const rhoEff = calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, primaryDim);
    const pa     = calcParallelRa(rhoEff, primaryDim, ROD_DIAMETER, n);
    parallelAdvice = {
      aantalPennen: n,
      minAfstand:   pa.spacingMin,
      rParallel:    Math.round(pa.rParallel * 100) / 100,
      rSingle:      Math.round(pa.rSingle   * 100) / 100,
      reason:       'resistance',
    };
  }

  // ─── Risk class — uses combined Ra when driveability forces multiple rods ─
  const effectiveDepth = (parallelAdvice?.reason === 'driveability')
    ? (parallelAdvice.zMax?.typical ?? primaryDim)
    : primaryDim;
  const riskClass = calcDiepteRiskClass({ rho, groundwaterDepth, ph, depth: effectiveDepth });

  const corrosionClass = calcCorrosionClass(ph);

  return { scenarios, electrodeType, rhoDry, rhoWet, gwGunstig, gwGemiddeld, gwOngunstig, riskClass, corrosionClass, parallelAdvice, driveability: driveabilityInfo };
}
