/** Canonical electrode diameter contract — mm in UI/DB, m in kernel formulas. */

export const DEFAULT_ELECTRODE_DIAMETER_MM = 14;
export const DEFAULT_ELECTRODE_DIAMETER_M = 0.014;

export const ELECTRODE_DIAMETER_MIN_MM = 4;
export const ELECTRODE_DIAMETER_MAX_MM = 50;

export type ElectrodeDiameterPresetId =
  | 'pen_14'
  | 'pen_16'
  | 'pen_19'
  | 'cu_25'
  | 'cu_35'
  | 'cu_50'
  | 'custom';

export const ELECTRODE_DIAMETER_PRESETS: ReadonlyArray<{
  id: ElectrodeDiameterPresetId;
  label: string;
  mm: number;
}> = [
  { id: 'pen_14', label: 'Standaard grondpen (5/8")', mm: 14 },
  { id: 'pen_16', label: 'Grondpen 16 mm', mm: 16 },
  { id: 'pen_19', label: 'Grondpen 3/4"', mm: 19 },
  { id: 'cu_25', label: 'Massief koper 25 mm²', mm: 5.6 },
  { id: 'cu_35', label: 'Massief koper 35 mm²', mm: 6.7 },
  { id: 'cu_50', label: 'Massief koper 50 mm²', mm: 8.0 },
  { id: 'custom', label: 'Anders (mm)', mm: DEFAULT_ELECTRODE_DIAMETER_MM },
];

/** Cross-section mm² → diameter mm: d = 2·√(A/π) */
export function diameterMmFromCrossSectionMm2(areaMm2: number): number {
  return 2 * Math.sqrt(areaMm2 / Math.PI);
}

export function mmToRodDiameterM(mm: number): number {
  return mm / 1000;
}

export function rodDiameterMToMm(m: number): number {
  return m * 1000;
}

export function normalizeElectrodeDiameterMm(v: unknown): number {
  if (v == null) return DEFAULT_ELECTRODE_DIAMETER_MM;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_ELECTRODE_DIAMETER_MM;
  return Math.round(n * 10) / 10;
}

export function presetIdForDiameterMm(mm: number): ElectrodeDiameterPresetId {
  const match = ELECTRODE_DIAMETER_PRESETS.find(p => p.id !== 'custom' && Math.abs(p.mm - mm) < 0.05);
  return match?.id ?? 'custom';
}

/** Thicker pen → lower achievable depth (punt ∝ d², mantel ∝ d). Reference: 14 mm. */
export function driveabilityDiameterScale(rodDiameterM: number): number {
  const d = rodDiameterM > 0 ? rodDiameterM : DEFAULT_ELECTRODE_DIAMETER_M;
  return Math.pow(DEFAULT_ELECTRODE_DIAMETER_M / d, 1.5);
}

export type Stopreden = 'doel_bereikt' | 'vastgelopen' | 'materiaal_op' | 'onbekend';

export const STOPREDEN_OPTIONS: ReadonlyArray<{ value: Stopreden; label: string }> = [
  { value: 'doel_bereikt', label: 'Doel bereikt' },
  { value: 'vastgelopen',  label: 'Vastgelopen in grond' },
  { value: 'materiaal_op', label: 'Materiaal op' },
  { value: 'onbekend',     label: 'Onbekend' },
];

export function normalizeStopreden(v: unknown): Stopreden {
  const allowed: Stopreden[] = ['doel_bereikt', 'vastgelopen', 'materiaal_op', 'onbekend'];
  if (typeof v === 'string' && (allowed as string[]).includes(v)) return v as Stopreden;
  return 'onbekend';
}

export function formatElectrodeDiameterLabel(mm: number): string {
  return `⌀ ${mm.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm`;
}

export function isNonStandardElectrodeDiameterMm(mm: number): boolean {
  return Math.abs(mm - DEFAULT_ELECTRODE_DIAMETER_MM) > 0.05;
}
