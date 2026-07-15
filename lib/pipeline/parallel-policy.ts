/**
 * Parallel-rod policy — single source of truth for when we advise multiple rods.
 *
 * Aanbevolen configuratie (UI/PDF/monteur) = één pen op Dwight-diepte, tenzij
 * indrijfbaarheid de diepte fysiek begrenst. Parallelschakeling is géén functie
 * van “diepe pen” alleen.
 *
 * parallelAdvice  — verplicht: indrijfbaarheid cap + doel-R niet haalbaar met 1 pen
 * parallelOption  — optioneel: gebruiker vroeg expliciet om parallel-berekening
 */

import { calcParallelRa } from '@/lib/calculations';

export type ParallelReason = 'driveability' | 'requested';

export interface ParallelLayout {
  aantalPennen:      number;
  minAfstand:        number;
  rParallel:         number;
  rSingle:           number;
  reason:            ParallelReason;
  targetUnreachable?: boolean;
}

/** Minimum aantal pennen op vaste diepte L om target R te halen (Schwarz). */
export function computeParallelLayout(
  rhoEff: number,
  depth: number,
  target: number,
  diameter: number,
  reason: ParallelReason,
): ParallelLayout | null {
  if (depth <= 0 || !Number.isFinite(rhoEff) || rhoEff <= 0) return null;

  const single = calcParallelRa(rhoEff, depth, diameter, 1);
  if (single.rParallel <= target) {
    return {
      aantalPennen: 1,
      minAfstand:   single.spacingMin,
      rParallel:    Math.round(single.rParallel * 100) / 100,
      rSingle:      Math.round(single.rParallel * 100) / 100,
      reason,
      targetUnreachable: false,
    };
  }

  for (let n = 2; n <= 6; n++) {
    const pa = calcParallelRa(rhoEff, depth, diameter, n);
    if (pa.rParallel <= target) {
      return {
        aantalPennen: n,
        minAfstand:   pa.spacingMin,
        rParallel:    Math.round(pa.rParallel * 100) / 100,
        rSingle:      Math.round(single.rParallel * 100) / 100,
        reason,
        targetUnreachable: false,
      };
    }
    if (n === 6) {
      return {
        aantalPennen: 6,
        minAfstand:   pa.spacingMin,
        rParallel:    Math.round(pa.rParallel * 100) / 100,
        rSingle:      Math.round(single.rParallel * 100) / 100,
        reason,
        targetUnreachable: true,
      };
    }
  }

  return null;
}

/** Alleen verplicht parallel-advies (monteur/DB) — niet optionele verkenning. */
export function isMandatoryParallel(layout: ParallelLayout | null | undefined): layout is ParallelLayout {
  return layout != null && layout.reason === 'driveability' && layout.aantalPennen > 1;
}
