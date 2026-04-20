// ─── Ohm Calculator (with ALS/RCD) ───────────────────────────────────────────

export interface OhmAlsInput {
  voltage: number;       // default 50
  leakageCurrent: number; // e.g. 0.03
}

export interface OhmAlsResult {
  r_theoretical: number;
  r_practical: number;
  r_recommended: number;
}

export function calcOhmAls(input: OhmAlsInput): OhmAlsResult {
  const r_theoretical = input.voltage / input.leakageCurrent;
  const r_practical = Math.min(r_theoretical, 166);
  const r_recommended = Math.min(r_practical, 30);
  return { r_theoretical, r_practical, r_recommended };
}

// ─── Ohm Calculator (without ALS/RCD) ────────────────────────────────────────

export type BreakerType = 'B' | 'C';

export interface OhmNoAlsInput {
  nominalCurrent: number;   // In (A)
  breakerType: BreakerType;
  cableLength: number;      // metres
  crossSection: number;     // mm²
}

export interface OhmNoAlsResult {
  zs_max: number;
  ia: number;
  r_cable: number;
  r_pen_max: number;
  warning: boolean;
}

export function calcOhmNoAls(input: OhmNoAlsInput): OhmNoAlsResult {
  const factor = input.breakerType === 'B' ? 5 : 10;
  const ia = input.nominalCurrent * factor;
  const zs_max = 230 / ia;

  // R = (2 * ρ_cu * L) / A  where ρ_cu = 0.0175 Ω·mm²/m
  const r_cable = (2 * 0.0175 * input.cableLength) / input.crossSection;
  const r_pen_max = zs_max - r_cable;

  return {
    zs_max,
    ia,
    r_cable,
    r_pen_max,
    warning: r_pen_max < 0.5,
  };
}

// ─── Diepte Calculator (Dwight formula) ──────────────────────────────────────

export interface DiepteInput {
  rho: number;             // soil resistivity Ω·m
  targetResistance: number; // target grounding resistance Ω
  rodDiameter: number;     // rod diameter m (e.g. 0.016)
  groundwaterDepth: number; // depth to groundwater m
  ph: number;              // soil pH
}

export interface DiepteResult {
  depth: number;           // required depth in metres
  achievedResistance: number;
  correctionGroundwater: number;
  correctionPh: number;
}

export function calcDiepte(input: DiepteInput): DiepteResult {
  const { rho, targetResistance, rodDiameter: d, groundwaterDepth, ph } = input;

  // Groundwater correction factor
  let corrGroundwater: number;
  if (groundwaterDepth < 2) {
    corrGroundwater = 0.70;
  } else if (groundwaterDepth <= 5) {
    corrGroundwater = 1.00;
  } else {
    corrGroundwater = 1.35;
  }

  // pH correction factor
  let corrPh: number;
  if (ph < 5) {
    corrPh = 1.20;
  } else if (ph <= 7.5) {
    corrPh = 1.00;
  } else {
    corrPh = 0.95;
  }

  const combinedCorrection = corrGroundwater * corrPh;
  const effectiveTarget = targetResistance / combinedCorrection;

  let L = 1.0;
  const step = 0.25;
  const maxIterations = 400;
  let R = Infinity;

  for (let i = 0; i < maxIterations; i++) {
    // Dwight formula: R = (ρ / (2πL)) * ln(4L/d)
    R = (rho / (2 * Math.PI * L)) * Math.log((4 * L) / d);
    if (R <= effectiveTarget) break;
    L += step;
  }

  return {
    depth: Math.round(L * 100) / 100,
    achievedResistance: Math.round(R * combinedCorrection * 100) / 100,
    correctionGroundwater: corrGroundwater,
    correctionPh: corrPh,
  };
}

// ─── BRO lithoClass → rho mapping ────────────────────────────────────────────

export const LITHO_CLASS_TO_RHO: Record<number, number> = {
  1: 30,
  2: 60,
  3: 125,
  4: 300,
  5: 2000,
  6: 4000,
};

export function lithoClassToRho(lithoClass: number): number {
  return LITHO_CLASS_TO_RHO[lithoClass] ?? 125;
}
