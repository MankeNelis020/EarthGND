/**
 * Stage 1 — Parse / canonicalize raw input.
 * Converts strings to numbers (handles comma-decimal), coerces booleans,
 * validates NaN/Infinity early. Does NOT apply domain rules (that's validate.ts).
 */

import type { RawDiepteInput, ValidatedDiepteInput, ElectrodeType, DataSource, SoilSample } from './types';
import type { DriveMethod } from './driveability';
import { normalizeElectrodeDiameterMm } from '@/lib/electrode-diameter';
export type { ValidatedDiepteInput } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a value that might be a number, a string (possibly with comma), or unknown. */
export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1';
  if (typeof v === 'number') return v !== 0;
  return false;
}

function parseDataSource(v: unknown): DataSource {
  const allowed: DataSource[] = ['cpt', 'bhrgt', 'geotop', 'bodemkaart', 'manual', 'fallback'];
  if (typeof v === 'string' && (allowed as string[]).includes(v)) return v as DataSource;
  return 'manual';
}

function parseElectrodeType(v: unknown): ElectrodeType {
  if (v === 'lint') return 'lint';
  return 'pen';
}

function parseDriveMethod(v: unknown): DriveMethod | undefined {
  const allowed: DriveMethod[] = ['handslag', 'sds', 'pneumatisch', 'voorboren'];
  if (typeof v === 'string' && (allowed as string[]).includes(v)) return v as DriveMethod;
  return undefined;
}

function parseSoilSamples(v: unknown): SoilSample[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(s => s && typeof s === 'object' && typeof s.depth === 'number' && typeof s.lithoClass === 'number')
    .map(s => ({ depth: s.depth as number, lithoClass: s.lithoClass as number }))
    .sort((a, b) => a.depth - b.depth);
}

// ─── Parsed intermediate (may contain nulls before validate) ─────────────────

export interface ParsedDiepteInput {
  rho:                   number | null;
  targetResistance:      number | null;
  groundwaterDepth:      number | null;
  ph:                    number | null;
  postcode?:             string;
  huisnummer?:           string;
  electrodeType:         ElectrodeType;
  lintBurialDepth:       number | null;
  lintConductorDiameter: number | null;
  lithoClass:            number | null;
  rhoDryOverride:        number | null;
  hasBroProfile:         boolean;
  drijfmethode:          DriveMethod | undefined;
  soilSamples:           SoilSample[];
  dataSource:            DataSource;
  boringAfstand:         number | null; // km
  boringJaar:            number | null;
  confirmed:             boolean;
  parallelRequested:     boolean;
  electrodeDiameterMm:   number | null;
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function parseDiepteInput(raw: RawDiepteInput): ParsedDiepteInput {
  return {
    rho:                   parseNumber(raw.rho),
    targetResistance:      parseNumber(raw.targetResistance),
    groundwaterDepth:      parseNumber(raw.groundwaterDepth),
    ph:                    parseNumber(raw.ph),
    postcode:              typeof raw.postcode === 'string' ? raw.postcode.trim() || undefined : undefined,
    huisnummer:            typeof raw.huisnummer === 'string' ? raw.huisnummer.trim() || undefined : undefined,
    electrodeType:         parseElectrodeType(raw.electrodeType),
    lintBurialDepth:       parseNumber(raw.lintBurialDepth),
    lintConductorDiameter: parseNumber(raw.lintConductorDiameter),
    lithoClass:            parseNumber(raw.lithoClass),
    rhoDryOverride:        parseNumber(raw.rhoDryOverride),
    hasBroProfile:         parseBoolean(raw.hasBroProfile),
    drijfmethode:          parseDriveMethod(raw.drijfmethode),
    soilSamples:           parseSoilSamples(raw.soilSamples),
    dataSource:            parseDataSource(raw.dataSource),
    boringAfstand:         parseNumber(raw.boringAfstand),
    boringJaar:            parseNumber(raw.boringJaar),
    confirmed:             parseBoolean(raw.confirmed),
    parallelRequested:     parseBoolean(raw.parallelRequested),
    electrodeDiameterMm:   parseNumber(raw.electrodeDiameterMm),
  };
}

/** Build the final ValidatedDiepteInput from a parsed input that passed all checks. */
export function buildValidated(p: ParsedDiepteInput): ValidatedDiepteInput {
  return {
    rho:                   p.rho!,
    targetResistance:      p.targetResistance!,
    groundwaterDepth:      p.groundwaterDepth!,
    ph:                    p.ph ?? 7.0,
    postcode:              p.postcode,
    huisnummer:            p.huisnummer,
    electrodeType:         p.electrodeType,
    lintBurialDepth:       p.lintBurialDepth ?? 0.8,
    lintConductorDiameter: p.lintConductorDiameter ?? 0.01,
    lithoClass:            p.lithoClass ?? undefined,
    rhoDryOverride:        p.rhoDryOverride ?? undefined,
    hasBroProfile:         p.hasBroProfile,
    drijfmethode:          p.drijfmethode,
    soilSamples:           p.soilSamples,
    dataSource:            p.dataSource,
    boringAfstand:         p.boringAfstand ?? undefined,
    boringJaar:            p.boringJaar ?? undefined,
    parallelRequested:     p.parallelRequested,
    electrodeDiameterMm:   normalizeElectrodeDiameterMm(p.electrodeDiameterMm),
  };
}
