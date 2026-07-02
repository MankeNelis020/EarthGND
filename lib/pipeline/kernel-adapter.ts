/**
 * Stage 6 — Kernel adapter (thin wrapper).
 *
 * Calls the existing, unchanged kernel functions (calcDiepte, calcLint, calcParallelRa, etc.)
 * from lib/calculations.ts. The kernel is a pure function and receives ONLY a
 * ValidatedDiepteInput — no UI, credit, fallback, or confidence logic.
 *
 * Parallel-rod policy (see parallel-policy.ts):
 *   - Default recommendation: 1 pen at Dwight depth (scenarios.gemiddeld).
 *   - parallelAdvice: ONLY when driveability caps depth AND n>1 rods are required.
 *   - parallelOption: ONLY when parallelRequested=true (user opt-in exploration).
 *   Never auto-suggest parallel based on depth alone.
 */

import {
  calcDiepte,
  calcLint,
  calcCorrosionClass,
  calcDiepteRiskClass,
  lithoClassToRhoDry,
  calcRhoEffective,
  type DiepteResult,
  type LintResult,
  type RiskClassResult,
  type CorrosionClass,
} from '@/lib/calculations';
import type { ValidatedDiepteInput } from './parse';
import { calcZMax, type DriveMethod, type ZMaxBand, type RefusalLayer } from './driveability';
import { resolveRhoWet } from './rho-priors';
import {
  calcDiepteWithNlLayered,
  effectiveRhoAtDepth,
  resolveDominantLithoClass,
  sanitizePipelineRho,
  type RhoModel,
} from './effective-rho';
import {
  computeParallelLayout,
  type ParallelLayout,
} from './parallel-policy';
import { mmToRodDiameterM } from '@/lib/electrode-diameter';

/** @deprecated Use ParallelLayout from parallel-policy.ts — kept for API compat. */
export type ParallelAdvice = ParallelLayout & {
  zMax?:            ZMaxBand;
  refusalLayer?:    RefusalLayer | null;
};

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
  /** Verplicht parallel-advies (indrijfbaarheid, n>1). Null = één pen volstaat. */
  parallelAdvice: ParallelAdvice | null;
  /** Optioneel: gebruiker vroeg parallelschakeling op Dwight-diepte. */
  parallelOption: ParallelLayout | null;
  /** Diameter used in kernel (m). */
  rodDiameterM: number;
  effectiveRho?:      number;
  dominantLithoClass?: number;
  rhoModel?:          RhoModel;
  driveability?: {
    method:           DriveMethod;
    zMax:             ZMaxBand;
    refusalLayer:     RefusalLayer | null;
    isLimited:        boolean;
    requiresParallel: boolean;
  };
}

function rhoEffTwoLayer(
  rhoDry: number,
  rhoWet: number,
  gw: number,
  depth: number,
): number {
  return calcRhoEffective(rhoDry, rhoWet, gw, depth);
}

export function runKernel(input: ValidatedDiepteInput): KernelResult {
  const { rho, targetResistance, groundwaterDepth, ph, electrodeType,
          lintBurialDepth, lintConductorDiameter,
          lithoClass, rhoDryOverride,
          drijfmethode, soilSamples, parallelRequested, electrodeDiameterMm } = input;

  const rodDiameterM = electrodeType === 'pen'
    ? mmToRodDiameterM(electrodeDiameterMm)
    : mmToRodDiameterM(14);

  const dominantLitho = resolveDominantLithoClass(soilSamples, lithoClass);
  const lithoForModel = dominantLitho ?? lithoClass;
  const rhoSanitized = sanitizePipelineRho(rho, lithoForModel);
  const layeredSamples = soilSamples && soilSamples.length > 0 ? soilSamples : undefined;
  const rhoModel: RhoModel = layeredSamples ? 'layered-nl' : lithoForModel ? 'two-layer' : 'single';

  const rhoDry = rhoDryOverride ?? (lithoForModel ? lithoClassToRhoDry(lithoForModel) : Math.round(rhoSanitized * 2.2));
  const rhoWet = input.rhoWetOverride ?? resolveRhoWet(lithoForModel, rhoSanitized);

  const gwGunstig   = groundwaterDepth;
  const gwGemiddeld = groundwaterDepth + 1.5;
  const gwOngunstig = groundwaterDepth + 3.0;

  let scenarios: KernelResult['scenarios'];

  if (electrodeType === 'lint') {
    const burial = lintBurialDepth;
    scenarios = {
      gunstig:   calcLint({ rho: burial < gwGunstig   ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      gemiddeld: calcLint({ rho: burial < gwGemiddeld ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      ongunstig: calcLint({ rho: burial < gwOngunstig ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
    };
  } else if (layeredSamples) {
    scenarios = {
      gunstig:   calcDiepteWithNlLayered({ targetResistance, rodDiameter: rodDiameterM, gwDepth: gwGunstig,   soilSamples: layeredSamples }),
      gemiddeld: calcDiepteWithNlLayered({ targetResistance, rodDiameter: rodDiameterM, gwDepth: gwGemiddeld, soilSamples: layeredSamples }),
      ongunstig: calcDiepteWithNlLayered({ targetResistance, rodDiameter: rodDiameterM, gwDepth: gwOngunstig, soilSamples: layeredSamples }),
    };
  } else {
    scenarios = {
      gunstig:   calcDiepte({ rho: rhoSanitized, targetResistance, rodDiameter: rodDiameterM, gwDepth: gwGunstig,   rhoDry, rhoWet }),
      gemiddeld: calcDiepte({ rho: rhoSanitized, targetResistance, rodDiameter: rodDiameterM, gwDepth: gwGemiddeld, rhoDry, rhoWet }),
      ongunstig: calcDiepte({ rho: rhoSanitized, targetResistance, rodDiameter: rodDiameterM, gwDepth: gwOngunstig, rhoDry, rhoWet }),
    };
  }

  const gemiddeld  = scenarios.gemiddeld as { depth?: number; length?: number; achievedResistance: number };
  const primaryDim = gemiddeld.depth ?? gemiddeld.length ?? 0;

  let parallelAdvice: ParallelAdvice | null = null;
  let parallelOption: ParallelLayout | null = null;
  let driveabilityInfo: KernelResult['driveability'] = undefined;

  if (electrodeType === 'pen' && drijfmethode) {
    const samples = (soilSamples && soilSamples.length > 0)
      ? soilSamples
      : (lithoForModel ? [{ depth: primaryDim * 0.5, lithoClass: lithoForModel }] : []);

    const drive = calcZMax(samples, drijfmethode, primaryDim, rodDiameterM);
    driveabilityInfo = {
      method: drijfmethode,
      zMax: drive.zMax,
      refusalLayer: drive.refusalLayer,
      isLimited: drive.isLimited,
      requiresParallel: drive.requiresParallel,
    };

    if (drive.requiresParallel) {
      const zCapped = drive.zMax.typical;
      const rhoEff  = rhoEffTwoLayer(rhoDry, rhoWet, gwGemiddeld, zCapped);
      const layout  = computeParallelLayout(rhoEff, zCapped, targetResistance, rodDiameterM, 'driveability');

      if (layout && layout.aantalPennen > 1) {
        parallelAdvice = {
          ...layout,
          zMax: drive.zMax,
          refusalLayer: drive.refusalLayer,
        };
      }
    }
  }

  if (parallelRequested && electrodeType === 'pen' && primaryDim > 0) {
    const rhoEffDwight = effectiveRhoAtDepth({
      soilSamples: layeredSamples,
      gwDepth: gwGemiddeld,
      rodLength: primaryDim,
      lithoClass: lithoForModel,
      rhoDry,
      rhoWet,
      rhoFallback: rhoSanitized,
    });
    parallelOption = computeParallelLayout(
      rhoEffDwight,
      primaryDim,
      targetResistance,
      rodDiameterM,
      'requested',
    );
  }

  const driveCapped = driveabilityInfo?.requiresParallel === true;
  const recommendedDepth = driveCapped
    ? (parallelAdvice?.zMax?.typical ?? driveabilityInfo!.zMax.typical)
    : primaryDim;

  const effectiveRho = effectiveRhoAtDepth({
    soilSamples: layeredSamples,
    gwDepth: gwGemiddeld,
    rodLength: recommendedDepth,
    lithoClass: lithoForModel,
    rhoDry,
    rhoWet,
    rhoFallback: rhoSanitized,
  });

  const riskClass = calcDiepteRiskClass({
    rho: effectiveRho,
    groundwaterDepth,
    ph,
    depth: recommendedDepth,
  });

  const corrosionClass = calcCorrosionClass(ph);

  return {
    scenarios, electrodeType, rhoDry, rhoWet, gwGunstig, gwGemiddeld, gwOngunstig,
    riskClass, corrosionClass, parallelAdvice, parallelOption, driveability: driveabilityInfo,
    rodDiameterM,
    effectiveRho, dominantLithoClass: lithoForModel, rhoModel,
  };
}
