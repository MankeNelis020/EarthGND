/**
 * Poort D — Feature flags voor gefaseerde activering van empirische grondkennis.
 *
 * Alle waarden worden ALTIJD uit process.env gelezen (per request in Next.js App Router).
 * Nooit hardcoden — één env-wijziging = directe rollback zonder deploy.
 *
 * Standaardwaarden (staging):
 *   SOIL_KNOWLEDGE_ACTIVE=true
 *   EMPIRICAL_WEIGHT=0.1      (10% empirie, 90% literatuurprior)
 *   ENABLED_CLASSES=geleidend (lithoClass 1=klei, 5=veen)
 *   CONFIDENCE_THRESHOLD=0.5
 *   EMERGENCY_ROLLBACK=false  (true = directe terugval naar L1, geen blend)
 */

import type { ActivePriorSource } from './active-prior';

/** lithoClass-nummers voor de geleidende klasse (klei + veen). */
const GELEIDENDE_CLASSES = new Set([1, 5]);

/** True als een noodstop actief is — overschrijft SOIL_KNOWLEDGE_ACTIVE. */
export function isEmergencyRollback(): boolean {
  return process.env.EMERGENCY_ROLLBACK === 'true';
}

/** Gewicht van empirisch model in blend (0–1, default 0.1). */
export function getEmpiricalWeight(): number {
  const w = parseFloat(process.env.EMPIRICAL_WEIGHT ?? '0.1');
  return isFinite(w) && w >= 0 && w <= 1 ? w : 0.1;
}

/** Minimum confidence voor blend (0–1, default 0.5). Onder drempel → L1. */
export function getConfidenceThreshold(): number {
  const t = parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.5');
  return isFinite(t) && t >= 0 && t <= 1 ? t : 0.5;
}

/**
 * True als lithoClass actief is voor empirische blend.
 *
 * ENABLED_CLASSES accepteert:
 *   'geleidend'  → lithoClass 1 (klei) en 5 (veen)
 *   '1,5'        → expliciete klasse-nummers
 */
export function isLithoClassEnabled(lithoClass: number | null | undefined): boolean {
  if (lithoClass == null) return false;
  const raw = process.env.ENABLED_CLASSES ?? 'geleidend';
  const classes = raw.split(',').map(s => s.trim());
  if (classes.includes('geleidend')) return GELEIDENDE_CLASSES.has(lithoClass);
  return classes.map(Number).filter(Number.isFinite).includes(lithoClass);
}

/**
 * Confidence-score (0–1) op basis van de empirische bron.
 * Hoger = meer data, hogere kwaliteit.
 *
 * Drempel CONFIDENCE_THRESHOLD (default 0.5): onder drempel → geen blend.
 */
export function sourceToConfidence(source: ActivePriorSource): number {
  switch (source) {
    case 'l4_local':             return 0.9;   // IDW-interpolatie ≤500 m
    case 'l3_regional_agnostic': return 0.75;  // class-agnostisch regionaal
    case 'l3_regional':          return 0.7;   // per-klasse regionaal
    case 'l2_global':            return 0.55;  // per-klasse globaal
    case 'l1_literature':
    default:                     return 0.0;
  }
}
