/**
 * GeoTOP → EarthGND class *distribution* for independent validation.
 * Does NOT replace production klasToLithoClass used by bro.ts.
 * Empirical rho MUST have zero effect on this mapping (tested).
 */

import { GEOTOP } from '@/lib/geotop-config';
import type { EarthGndLithoClass } from './gate-config';

export type EarthGndClassDist = Partial<Record<EarthGndLithoClass, number>>;

/**
 * Soft mapping from GeoTOP lithoklasse (0–9) → EarthGND 1–5 probabilities.
 * Probabilities per row sum to 1.
 */
export const GEOTOP_TO_EARTHGND_DIST: Record<number, EarthGndClassDist> = {
  0: { 3: 0.7, 2: 0.2, 1: 0.1 }, // antropogeen — uncertain
  1: { 5: 0.95, 1: 0.05 }, // organisch / veen
  2: { 1: 0.92, 2: 0.08 }, // klei
  3: { 2: 0.75, 1: 0.15, 3: 0.1 }, // kleiig zand / leem
  4: { 3: 1 }, // unused
  5: { 3: 0.9, 2: 0.1 }, // fijn zand
  6: { 3: 0.88, 4: 0.12 }, // matig grof zand
  7: { 3: 0.55, 4: 0.45 }, // grof zand — straddles sand/gravel
  8: { 4: 0.9, 3: 0.1 }, // grind
  9: { 3: 0.85, 4: 0.15 }, // schelpen
};

/** Map without using any ρ argument — signature forbids rho leakage. */
export function mapGeotopToEarthGndDist(geotopKlas: number): EarthGndClassDist {
  const dist = GEOTOP_TO_EARTHGND_DIST[geotopKlas];
  if (dist) return { ...dist };
  // Fallback to production hard map as singleton
  const hard = GEOTOP.klasToLithoClass[geotopKlas] ?? 3;
  return { [hard as EarthGndLithoClass]: 1 };
}

export function dominantEarthGndClass(dist: EarthGndClassDist): EarthGndLithoClass {
  let best: EarthGndLithoClass = 3;
  let bestP = -1;
  for (const [k, p] of Object.entries(dist)) {
    const cls = Number(k) as EarthGndLithoClass;
    if ((p ?? 0) > bestP) {
      bestP = p ?? 0;
      best = cls;
    }
  }
  return best;
}

export function geotopRawLabel(geotopKlas: number): string {
  return GEOTOP.klasName[geotopKlas] ?? `klas_${geotopKlas}`;
}
