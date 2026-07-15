/**
 * P1 leidingwerk — effectieve ρ en NL-gelaagd model (adapter-laag).
 *
 * De kernel (lib/calculations.ts) blijft ongewijzigd. Deze module spiegelt
 * calcLayeredRhoEffective / calcDiepte voor het gelaagde pad, maar gebruikt
 * resolveRhoWet() (NL_RHO_WET_PRIOR) i.p.v. lithoClassToRhoWet() in natte segmenten.
 *
 * Zie docs/contracts.md §C voor de prioriteit per context.
 */

import {
  calcRhoEffective,
  lithoClassToRhoDry,
  type DiepteInput,
  type DiepteResult,
  type LayeredSoilSample,
} from '@/lib/calculations';
import { resolveRhoWet } from './rho-priors';
import type { SoilSample } from './types';

export type RhoModel = 'layered-nl' | 'two-layer' | 'single';

function nlConductanceLength(
  length: number,
  lithoClass: number,
  saturated: boolean,
  rhoScale = 1,
): number {
  const rho = saturated
    ? resolveRhoWet(lithoClass, 125)
    : lithoClassToRhoDry(lithoClass);
  return length / (rho * rhoScale);
}

/** Gelaagd harmonisch gemiddelde met NL natte priors (adapter, niet kernel). */
export function calcLayeredRhoEffectiveNl(
  samples: LayeredSoilSample[],
  gwDepth: number,
  rodLength: number,
  rhoScale = 1,
): number {
  const sorted = samples
    .map((s) => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass }))
    .filter((s) => Number.isFinite(s.depth) && Number.isFinite(s.lithoClass) && s.depth >= 0)
    .sort((a, b) => a.depth - b.depth);

  if (!sorted.length) return resolveRhoWet(3, 125);

  let conductance = 0;

  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const next = sorted[i + 1];

    const intervalStart = i === 0 ? 0 : (prev.depth + cur.depth) / 2;
    const intervalEnd = next ? (cur.depth + next.depth) / 2 : rodLength;
    const start = Math.max(0, Math.min(rodLength, intervalStart));
    const end = Math.max(0, Math.min(rodLength, intervalEnd));
    if (end <= start) continue;

    if (gwDepth > start && gwDepth < end) {
      conductance += nlConductanceLength(gwDepth - start, cur.lithoClass, false, rhoScale);
      conductance += nlConductanceLength(end - gwDepth, cur.lithoClass, true, rhoScale);
    } else {
      conductance += nlConductanceLength(end - start, cur.lithoClass, end > gwDepth, rhoScale);
    }
  }

  return conductance > 0 ? rodLength / conductance : resolveRhoWet(3, 125);
}

/** Dwight-solver met NL-gelaagd model (vervangt kernel calcDiepte wanneer soilSamples aanwezig). */
export function calcDiepteWithNlLayered(
  input: Pick<DiepteInput, 'targetResistance' | 'rodDiameter'> & {
    gwDepth: number;
    soilSamples: LayeredSoilSample[];
    rhoScale?: number;
  },
): DiepteResult {
  const d = input.rodDiameter ?? 0.014;
  const { gwDepth, soilSamples, targetResistance, rhoScale } = input;

  let L = 1.0;
  let R = Infinity;
  for (let i = 0; i < 400; i++) {
    const rhoEff = calcLayeredRhoEffectiveNl(soilSamples, gwDepth, L, rhoScale);
    R = (rhoEff / (2 * Math.PI * L)) * Math.log((4 * L) / d);
    if (R <= targetResistance) break;
    L += 0.25;
  }
  return {
    depth: Math.round(L * 100) / 100,
    achievedResistance: Math.round(R * 100) / 100,
    converged: R <= targetResistance,
  };
}

/** Dominante lithoClass uit BRO-profiel (modus), met expliciete fallback. */
export function resolveDominantLithoClass(
  samples: SoilSample[] | undefined,
  fallback?: number | null,
): number | undefined {
  if (samples && samples.length > 0) {
    const counts: Record<number, number> = {};
    for (const s of samples) counts[s.lithoClass] = (counts[s.lithoClass] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) return parseInt(top[0], 10);
  }
  return fallback ?? undefined;
}

/** Diepste relevante sample op/onder GHG — voor driveability-weigering. */
export function deepestSampleBelowGhg(
  samples: SoilSample[] | undefined,
  gwDepth: number,
): SoilSample | undefined {
  if (!samples?.length) return undefined;
  const below = samples
    .map((s) => ({ depth: Math.abs(s.depth), lithoClass: s.lithoClass }))
    .filter((s) => s.depth >= gwDepth)
    .sort((a, b) => b.depth - a.depth);
  return below[0];
}

/**
 * Effectieve ρ op gegeven diepte — voor risicoklasse en UI-weergave.
 * Gebruikt hetzelfde model als de actieve berekening.
 */
export function effectiveRhoAtDepth(
  opts: {
    soilSamples?: SoilSample[];
    gwDepth: number;
    rodLength: number;
    lithoClass?: number | null;
    rhoDry?: number;
    rhoWet?: number;
    rhoFallback: number;
  },
): number {
  const { soilSamples, gwDepth, rodLength, lithoClass, rhoDry, rhoWet, rhoFallback } = opts;

  if (soilSamples && soilSamples.length > 0 && gwDepth != null) {
    return Math.round(calcLayeredRhoEffectiveNl(soilSamples, gwDepth, rodLength) * 10) / 10;
  }

  if (gwDepth != null && rhoDry != null && rhoWet != null) {
    return Math.round(calcRhoEffective(rhoDry, rhoWet, gwDepth, rodLength) * 10) / 10;
  }

  return sanitizePipelineRho(rhoFallback, lithoClass);
}

/** Voorkom GENERAL=2000 enkelvoudige ρ als enige fallback-representatie. */
export function sanitizePipelineRho(
  rho: number,
  lithoClass?: number | null,
): number {
  // Veen GENERAL (2000) of extreme enkelvoudige waarde zonder profiel → NL prior
  if (lithoClass === 5 || rho >= 500) {
    return resolveRhoWet(lithoClass ?? 5, rho);
  }
  return rho;
}

/** UI/pipeline preview vóór server-berekening. */
export function buildSoilRhoPreview(opts: {
  samples?: SoilSample[];
  gwDepth: number | null;
  dominantLithoClass?: number | null;
  dominantRho: number;
  dataSource?: string;
}): {
  lithoClass: number | undefined;
  effectiveRho: number;
  rhoDry: number | undefined;
  rhoWet: number | undefined;
  model: RhoModel;
  pipelineRho: number;
} {
  const lithoClass = resolveDominantLithoClass(opts.samples, opts.dominantLithoClass ?? null);
  const gw = opts.gwDepth ?? 3;
  const layered = opts.samples && opts.samples.length > 0 && opts.gwDepth != null;

  const rhoDry = lithoClass ? lithoClassToRhoDry(lithoClass) : undefined;
  const rhoWet = resolveRhoWet(lithoClass, opts.dominantRho);

  const previewDepth = 4;
  const effectiveRho = layered
    ? calcLayeredRhoEffectiveNl(opts.samples!, gw, previewDepth)
    : gw != null && rhoDry != null
      ? calcRhoEffective(rhoDry, rhoWet, gw, previewDepth)
      : sanitizePipelineRho(opts.dominantRho, lithoClass);

  const model: RhoModel = layered ? 'layered-nl' : rhoDry != null ? 'two-layer' : 'single';
  const pipelineRho = sanitizePipelineRho(Math.round(effectiveRho), lithoClass);

  return {
    lithoClass,
    effectiveRho: Math.round(effectiveRho * 10) / 10,
    rhoDry,
    rhoWet,
    model,
    pipelineRho,
  };
}
