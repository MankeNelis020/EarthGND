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
  rho: number;            // fallback single-layer ρ (Ω·m) — used when gwDepth/rhoDry/rhoWet absent
  targetResistance: number;
  rodDiameter?: number;   // default 0.014 m
  gwDepth?: number;       // groundwater table depth (m below surface) — enables two-layer model
  rhoDry?: number;        // dry-zone ρ (above water table)
  rhoWet?: number;        // saturated-zone ρ (below water table)
}

export interface DiepteResult {
  depth: number;
  achievedResistance: number;
}

export function calcDiepte(input: DiepteInput): DiepteResult {
  const d = input.rodDiameter ?? 0.014;
  const { gwDepth, rhoDry, rhoWet, rho } = input;
  const useTwoLayer = gwDepth != null && rhoDry != null && rhoWet != null;

  let L = 1.0;
  let R = Infinity;
  for (let i = 0; i < 400; i++) {
    const rhoEff = useTwoLayer
      ? calcRhoEffective(rhoDry!, rhoWet!, gwDepth!, L)
      : rho;
    R = (rhoEff / (2 * Math.PI * L)) * Math.log((4 * L) / d);
    if (R <= input.targetResistance) break;
    L += 0.25;
  }
  return {
    depth: Math.round(L * 100) / 100,
    achievedResistance: Math.round(R * 100) / 100,
  };
}

// ─── Lint-elektrode (horizontale strip, Dwight) ───────────────────────────────

export interface LintInput {
  rho: number;
  targetResistance: number;
  burialDepth?: number;       // default 0.8 m
  conductorDiameter?: number; // default 0.01 m (10 mm)
}

export interface LintResult {
  length: number;
  achievedResistance: number;
}

// Dwight formula for a horizontal conductor at depth h, length L, radius r:
// R = (ρ / 2πL) × [ln(2L/r) + ln(L/2h) − 2]
export function calcLint(input: LintInput): LintResult {
  const { rho, targetResistance } = input;
  const h = input.burialDepth ?? 0.8;
  const r = (input.conductorDiameter ?? 0.01) / 2;

  let L = 2.0;
  let R = Infinity;
  for (let i = 0; i < 2000; i++) {
    const term = Math.log(2 * L / r) + Math.log(L / (2 * h)) - 2;
    if (term > 0) R = (rho / (2 * Math.PI * L)) * term;
    if (R <= targetResistance) break;
    L += 0.5;
  }
  return {
    length: Math.round(L * 100) / 100,
    achievedResistance: Math.round(Math.max(0, R) * 100) / 100,
  };
}

// ─── Parallelle aardpennen (Schwarz/Dwight mutual resistance) ─────────────────

export interface ParallelRaResult {
  rParallel: number;
  spacingMin: number; // minimum recommended spacing in m
  rSingle: number;
}

// Parallel resistance of n identical vertical rods in a row, spaced `spacingMin` apart.
// Uses the Schwarz formula: R_n = (n·R₁ + 2·ΣMᵢⱼ) / n²
// Mutual resistance approximated by far-field: M(s) = ρ/(2π·s)
export function calcParallelRa(
  rho: number, L: number, rodDiameter: number, n: number,
): ParallelRaResult {
  const d = rodDiameter;
  const R1 = (rho / (2 * Math.PI * L)) * Math.log((4 * L) / d);
  const spacingMin = Math.ceil(2 * L); // min 2× rod length

  let sumM = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = Math.abs(j - i) * spacingMin;
      sumM += rho / (2 * Math.PI * s); // far-field mutual resistance (always positive)
    }
  }

  const rParallel = Math.max(0.01, (n * R1 + 2 * sumM) / (n * n));
  return {
    rParallel: Math.round(rParallel * 100) / 100,
    spacingMin,
    rSingle: Math.round(R1 * 100) / 100,
  };
}

// ─── Corrosieclassificatie (pH-gebaseerd) ─────────────────────────────────────

export interface CorrosionClass {
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  lifetimeYears: string;
  advies: string;
}

export function calcCorrosionClass(ph: number): CorrosionClass {
  if (ph < 4.5) return {
    label: 'Sterk corrosief',
    color: 'red',
    lifetimeYears: '5–10 jaar (staal)',
    advies: 'Koper-gebonden pen (min. 70 μm Cu) of RVS 316 aanbevolen. Controleer conform NEN 3140 na 5 jaar.',
  };
  if (ph < 6) return {
    label: 'Matig corrosief',
    color: 'orange',
    lifetimeYears: '15–20 jaar',
    advies: 'Verzinkt staal (min. 85 μm) of koper-gebonden pen. Aanbevolen: RVS of Cu-bonded voor lange levensduur.',
  };
  if (ph <= 8) return {
    label: 'Neutraal',
    color: 'green',
    lifetimeYears: '25+ jaar',
    advies: 'Standaard thermisch verzinkt staal volstaat (min. 50 μm conform NEN-EN 50522).',
  };
  return {
    label: 'Licht alkalisch',
    color: 'green',
    lifetimeYears: '30+ jaar',
    advies: 'Minimale corrosie verwacht. Standaard verzinkt staal geschikt.',
  };
}

// ─── BRO lithoClass → rho mapping ────────────────────────────────────────────

export const LITHO_CLASS_TO_RHO: Record<number, number> = {
  1: 30, 2: 60, 3: 125, 4: 300, 5: 2000, 6: 4000,
};

export function lithoClassToRho(lithoClass: number): number {
  return LITHO_CLASS_TO_RHO[lithoClass] ?? 125;
}

// ─── Two-layer soil model (dry above / saturated below groundwater table) ────
// Values calibrated from IEEE Std 80, CIGRE TB 95, BS7430.

export const LITHO_CLASS_TO_RHO_DRY: Record<number, number> = {
  1: 80,   // klei, droog
  2: 150,  // leem, droog
  3: 300,  // zand, droog
  4: 1000, // grind, droog
  5: 3000, // veen, droog (zelden boven GWT in NL)
  6: 4000, // rots
};

export const LITHO_CLASS_TO_RHO_WET: Record<number, number> = {
  1: 15,   // klei, verzadigd
  2: 40,   // leem, verzadigd
  3: 60,   // zand, verzadigd
  4: 150,  // grind, verzadigd
  5: 400,  // veen, verzadigd
  6: 4000, // rots (nauwelijks verschil)
};

export function lithoClassToRhoDry(lithoClass: number): number {
  return LITHO_CLASS_TO_RHO_DRY[lithoClass] ?? 300;
}

export function lithoClassToRhoWet(lithoClass: number): number {
  return LITHO_CLASS_TO_RHO_WET[lithoClass] ?? 60;
}

/**
 * Weighted two-layer effective resistivity for a vertical rod of length L.
 * Layer 1 (dry):  0 → gwDepth, resistivity = rhoDry
 * Layer 2 (wet):  gwDepth → L, resistivity = rhoWet
 */
export function calcRhoEffective(
  rhoDry: number,
  rhoWet: number,
  gwDepth: number,
  rodLength: number,
): number {
  if (gwDepth <= 0) return rhoWet;
  if (gwDepth >= rodLength) return rhoDry;
  return (rhoDry * gwDepth + rhoWet * (rodLength - gwDepth)) / rodLength;
}

// ─── Risk class (NEN 62305 / EN 50522) ───────────────────────────────────────

export type RiskClass = 'I' | 'II' | 'III' | 'IV';

export interface RiskClassResult {
  riskClass: RiskClass;
  label: string;
  color: string; // tailwind bg color token
  description: string;
}

// ─── Four-layer Ohm output ────────────────────────────────────────────────────

export interface OhmLayersInput {
  installationType: InstallationType;
  gridSystem: GridSystem;
  rcdCurrent?: number; // A
  breakerType?: BreakerType;
  breakerAmps?: number;
  voltageLimit?: 25 | 50;
}

export interface OhmLayersResult {
  wettelijkMax: number;
  praktischMax: number;
  ontwerpdoel: number;
  streefwaarde: number;
  norm: string;
  formula: string;
  formulaSteps: string[];
}

function r2(n: number): number {
  if (n < 1) return Math.round(n * 100) / 100;
  if (n < 10) return Math.round(n * 10) / 10;
  return Math.round(n);
}

export function calcOhmLayers(input: OhmLayersInput): OhmLayersResult {
  const wizard = calcOhmWizard({
    customerType: 'particulier',
    installationType: input.installationType,
    gridSystem: input.gridSystem,
    rcdPresent: input.rcdCurrent != null,
    rcdCurrent: input.rcdCurrent,
    breakerType: input.breakerType,
    breakerAmps: input.breakerAmps,
    voltageLimit: input.voltageLimit ?? 50,
  });

  const wettelijkMax = wizard.maxResistance;
  const praktischMax = r2(wettelijkMax * 0.75);

  const ontwerpdoelCap: Record<InstallationType, number> = {
    woning: 30,
    utiliteit: 10,
    industrieel: 5,
    bliksem: 10,
    medisch: 0.1,
  };

  const ontwerpdoel = r2(Math.min(wettelijkMax * 0.5, ontwerpdoelCap[input.installationType] ?? 30));
  const streefwaarde = r2(Math.min(ontwerpdoel, 30));

  return { wettelijkMax, praktischMax, ontwerpdoel, streefwaarde, norm: wizard.norm, formula: wizard.formula, formulaSteps: wizard.formulaSteps };
}

// ─── Diepte Risk Class (multi-factor) ────────────────────────────────────────

export interface DiepteRiskInput {
  rho: number;
  groundwaterDepth: number;
  ph: number;
  depth: number;
}

export function calcDiepteRiskClass(input: DiepteRiskInput): RiskClassResult {
  let score = 0;

  if (input.rho > 500)       score += 3;
  else if (input.rho > 150)  score += 2;
  else if (input.rho > 50)   score += 1;

  if (input.groundwaterDepth > 5) score += 1;
  if (input.ph < 5)               score += 1;
  else if (input.ph > 8.5)        score += 0.5;
  if (input.depth > 12)           score += 1;

  if (score <= 1) return {
    riskClass: 'I', color: 'green',
    label: 'Klasse I — Laag risico',
    description: 'Gunstige bodemcondities. Standaard aardpen volstaat, lage corrosiekans.',
  };
  if (score <= 3) return {
    riskClass: 'II', color: 'yellow',
    label: 'Klasse II — Gemiddeld risico',
    description: 'Normaal haalbaar. Licht verhoogde diepte of periodieke controle aanbevolen.',
  };
  if (score <= 5) return {
    riskClass: 'III', color: 'orange',
    label: 'Klasse III — Verhoogd risico',
    description: 'Meerdere pennen of specialistische aardmat aanbevolen. pH-meting ter plaatse vereist.',
  };
  return {
    riskClass: 'IV', color: 'red',
    label: 'Klasse IV — Hoog risico',
    description: 'Slecht geleidende of corrosieve grond. Specialistische oplossing vereist — diepboring of aardmat.',
  };
}

export function calcRiskClass(rho: number): RiskClassResult {
  if (rho <= 50) return {
    riskClass: 'I',
    label: 'Klasse I — Laag risico',
    color: 'green',
    description: 'Zeer geleidende grond (klei, nat). Aarding eenvoudig haalbaar.',
  };
  if (rho <= 150) return {
    riskClass: 'II',
    label: 'Klasse II — Gemiddeld risico',
    color: 'yellow',
    description: 'Gemiddeld geleidende grond (leem, vochtig zand). Standaard aardpen volstaat.',
  };
  if (rho <= 500) return {
    riskClass: 'III',
    label: 'Klasse III — Verhoogd risico',
    color: 'orange',
    description: 'Matig geleidende grond (droog zand). Diepere pen of meerdere pennen nodig.',
  };
  return {
    riskClass: 'IV',
    label: 'Klasse IV — Hoog risico',
    color: 'red',
    description: 'Slecht geleidende grond (veen, rots). Specialistische aardingsoplossing vereist.',
  };
}
