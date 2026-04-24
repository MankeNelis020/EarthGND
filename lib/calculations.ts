// ─── Ohm Calculator (with ALS/RCD) ───────────────────────────────────────────

export interface OhmAlsInput {
  voltage: number;
  leakageCurrent: number;
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

export type BreakerType = 'B' | 'C' | 'D';

export interface OhmNoAlsInput {
  nominalCurrent: number;
  breakerType: BreakerType;
  cableLength: number;
  crossSection: number;
}

export interface OhmNoAlsResult {
  zs_max: number;
  ia: number;
  r_cable: number;
  r_pen_max: number;
  warning: boolean;
}

export function calcOhmNoAls(input: OhmNoAlsInput): OhmNoAlsResult {
  const factorMap: Record<BreakerType, number> = { B: 5, C: 10, D: 20 };
  const ia = input.nominalCurrent * factorMap[input.breakerType];
  const zs_max = 230 / ia;
  const r_cable = (2 * 0.0175 * input.cableLength) / input.crossSection;
  const r_pen_max = zs_max - r_cable;
  return { zs_max, ia, r_cable, r_pen_max, warning: r_pen_max < 0.5 };
}

// ─── Ohm Wizard Calculator ────────────────────────────────────────────────────

export type CustomerType = 'particulier' | 'zakelijk';
export type InstallationType = 'woning' | 'utiliteit' | 'industrieel' | 'bliksem' | 'medisch';
export type GridSystem = 'TT' | 'TN' | 'IT';

export interface OhmWizardInput {
  customerType: CustomerType;
  installationType: InstallationType;
  gridSystem?: GridSystem;
  rcdPresent?: boolean;
  rcdCurrent?: number;   // in Ampere: 0.03 | 0.1 | 0.3 | 0.5
  breakerType?: BreakerType;
  breakerAmps?: number;
  voltageLimit?: 25 | 50;
}

export interface OhmWizardResult {
  maxResistance: number;
  formula: string;
  norm: string;
  indication: string;
  formulaSteps: string[];
}

const BREAKER_FACTOR: Record<BreakerType, number> = { B: 5, C: 10, D: 20 };

function norm(installationType: InstallationType): string {
  if (installationType === 'bliksem') return 'NEN 62305';
  if (installationType === 'medisch') return 'NEN 1010 afd. 710';
  if (installationType === 'industrieel') return 'NEN 1010 / NEN 50522';
  return 'NEN 1010';
}

function indication(r: number): string {
  if (r <= 0.5)  return 'Zeer uitdagend — professioneel systeem vereist (aardmatten, geleidende fundering)';
  if (r <= 2)    return 'Uitdagend — meerdere aardpennen parallel of aardmat noodzakelijk';
  if (r <= 10)   return 'Haalbaar met één of twee aardpennen in kleirijke of vochtige grond';
  if (r <= 30)   return 'Goed haalbaar in kleigrond; in zandgrond mogelijk twee aardpennen nodig';
  if (r <= 200)  return 'Eenvoudig haalbaar in de meeste grondsoorten';
  return 'Zeer eenvoudig haalbaar — zelfs in droge zandgrond';
}

export function calcOhmWizard(input: OhmWizardInput): OhmWizardResult {
  // ── Bliksembeveiliging (NEN 62305, vaste norm) ──────────────────────────────
  if (input.installationType === 'bliksem') {
    return {
      maxResistance: 10,
      formula: 'R ≤ 10 Ω',
      norm: norm('bliksem'),
      indication: indication(10),
      formulaSteps: [
        'NEN 62305 schrijft een vaste maximale aardingsweerstand voor.',
        'R ≤ 10 Ω',
      ],
    };
  }

  // ── Medische ruimte (NEN 1010 afd. 710, vaste norm) ─────────────────────────
  if (input.installationType === 'medisch') {
    return {
      maxResistance: 0.2,
      formula: 'R ≤ 0,2 Ω',
      norm: norm('medisch'),
      indication: indication(0.2),
      formulaSteps: [
        'Medische ruimten (groep 2) vereisen een bijzonder lage aardingsweerstand.',
        'R ≤ 0,2 Ω (NEN 1010 afdeling 710)',
      ],
    };
  }

  const UL = input.voltageLimit ?? 50;
  const n = norm(input.installationType);

  // ── TT-stelsel met aardlek ──────────────────────────────────────────────────
  if (input.gridSystem === 'TT' && input.rcdPresent && input.rcdCurrent) {
    const R = UL / input.rcdCurrent;
    const mA = input.rcdCurrent * 1000;
    return {
      maxResistance: R,
      formula: `R ≤ UL / IΔn = ${UL} V / ${mA} mA`,
      norm: n,
      indication: indication(R),
      formulaSteps: [
        `UL = ${UL} V  (aanraakspanningsgrens)`,
        `IΔn = ${mA} mA  (nominale aardlekstroom)`,
        `R ≤ ${UL} / ${input.rcdCurrent} = ${R.toFixed(1)} Ω`,
      ],
    };
  }

  // ── TN-stelsel ──────────────────────────────────────────────────────────────
  if (input.gridSystem === 'TN' && input.breakerType && input.breakerAmps) {
    const factor = BREAKER_FACTOR[input.breakerType];
    const Ia = factor * input.breakerAmps;
    const Zs = 230 / Ia;

    const steps = [
      `U₀ = 230 V  (nominale fase-aardspanning)`,
      `Ia = ${factor} × ${input.breakerAmps} A = ${Ia} A  (uitschakelstroom automaat type ${input.breakerType})`,
      `Zs ≤ U₀ / Ia = 230 / ${Ia} = ${Zs.toFixed(3)} Ω`,
    ];

    // Als ook aardlek aanwezig: meest restrictieve geldt
    if (input.rcdPresent && input.rcdCurrent) {
      const R_rcd = UL / input.rcdCurrent;
      const mA = input.rcdCurrent * 1000;
      if (R_rcd < Zs) {
        steps.push(`Aardlek: R ≤ ${UL} / ${mA} mA = ${R_rcd.toFixed(1)} Ω → meest beperkend`);
        return {
          maxResistance: R_rcd,
          formula: `R ≤ UL / IΔn = ${UL} V / ${mA} mA`,
          norm: n,
          indication: indication(R_rcd),
          formulaSteps: steps,
        };
      }
      steps.push(`Aardlek: R ≤ ${R_rcd.toFixed(1)} Ω → minder beperkend dan automaat`);
    }

    return {
      maxResistance: Zs,
      formula: `Zs ≤ U₀ / Ia = 230 V / (${factor} × ${input.breakerAmps} A)`,
      norm: n,
      indication: indication(Zs),
      formulaSteps: steps,
    };
  }

  // ── TT-stelsel zonder aardlek (automaat als enige beveiliging) ───────────────
  if (input.gridSystem === 'TT' && input.rcdPresent === false && input.breakerType && input.breakerAmps) {
    const factor = BREAKER_FACTOR[input.breakerType];
    const Ia = factor * input.breakerAmps;
    const R = UL / Ia;
    return {
      maxResistance: R,
      formula: `R ≤ UL / Ia = ${UL} V / (${factor} × ${input.breakerAmps} A)`,
      norm: n,
      indication: indication(R),
      formulaSteps: [
        `UL = ${UL} V  (aanraakspanningsgrens)`,
        `Ia = ${factor} × ${input.breakerAmps} A = ${Ia} A`,
        `R ≤ ${UL} / ${Ia} = ${R.toFixed(2)} Ω`,
        `Let op: TT zonder aardlek is ongebruikelijk — overweeg een aardlek toe te voegen.`,
      ],
    };
  }

  // ── IT-stelsel (vereenvoudigd) ───────────────────────────────────────────────
  if (input.gridSystem === 'IT') {
    const R = UL / 0.5;
    return {
      maxResistance: R,
      formula: `R ≤ UL / Id = ${UL} V / 0,5 A`,
      norm: n,
      indication: indication(R),
      formulaSteps: [
        `UL = ${UL} V`,
        `Id ≈ 0,5 A  (geschatte eerste foutstroom in IT-stelsel)`,
        `R ≤ ${UL} / 0,5 = ${R} Ω`,
        `Raadpleeg een installatiespecialist voor gedetailleerde IT-berekening.`,
      ],
    };
  }

  throw new Error('Onvoldoende gegevens voor berekening');
}

// ─── Diepte Calculator (Dwight formula) ──────────────────────────────────────

export interface DiepteInput {
  rho: number;
  targetResistance: number;
  rodDiameter: number;
  groundwaterDepth: number;
  ph: number;
}

export interface DiepteResult {
  depth: number;
  achievedResistance: number;
  correctionGroundwater: number;
  correctionPh: number;
}

export function calcDiepte(input: DiepteInput): DiepteResult {
  const { rho, targetResistance, rodDiameter: d, groundwaterDepth, ph } = input;

  let corrGroundwater: number;
  if (groundwaterDepth < 2) corrGroundwater = 0.70;
  else if (groundwaterDepth <= 5) corrGroundwater = 1.00;
  else corrGroundwater = 1.35;

  let corrPh: number;
  if (ph < 5) corrPh = 1.20;
  else if (ph <= 7.5) corrPh = 1.00;
  else corrPh = 0.95;

  const combinedCorrection = corrGroundwater * corrPh;
  const effectiveTarget = targetResistance / combinedCorrection;

  let L = 1.0;
  let R = Infinity;
  for (let i = 0; i < 400; i++) {
    R = (rho / (2 * Math.PI * L)) * Math.log((4 * L) / d);
    if (R <= effectiveTarget) break;
    L += 0.25;
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
  1: 30, 2: 60, 3: 125, 4: 300, 5: 2000, 6: 4000,
};

export function lithoClassToRho(lithoClass: number): number {
  return LITHO_CLASS_TO_RHO[lithoClass] ?? 125;
}
