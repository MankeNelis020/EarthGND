/**
 * getScanContext — leest een ScanContext uit een calculations-rij.
 *
 * Kolomnamen-contract (canonical): input_values + result
 * Legacy-kolomnamen (schema.sql vóór 2026-06):  input + resultaat
 *
 * De helper handelt beide varianten af zodat rapport-voorvulling werkt ongeacht
 * of de DB-migratie (rename_calculations_columns.sql) al is uitgevoerd.
 */

import type { ScanContext } from '@/lib/types/rapport';

type CalcRow = Record<string, unknown>;

export function getScanContext(calc: CalcRow | null): ScanContext {
  if (!calc) return {};

  // Canonical column names first; fall back to legacy names
  const input = (calc.input_values ?? calc.input ?? {}) as Record<string, unknown>;
  const result = (calc.result ?? calc.resultaat ?? {}) as Record<string, unknown>;

  return {
    postcode:           typeof calc.postcode === 'string' ? calc.postcode : undefined,
    rho:                typeof input.rho === 'number' ? input.rho : undefined,
    grondwaterstand_m:  typeof input.groundwaterDepth === 'number' ? input.groundwaterDepth : undefined,
    ph:                 typeof input.ph === 'number' ? input.ph : undefined,
    // result.dimension = depth (pen) or length (lint); legacy result may have "depth"
    voorspeld_diepte_m: typeof result.dimension === 'number' ? result.dimension
                      : typeof result.depth === 'number' ? result.depth
                      : undefined,
    voorspeld_ra_ohm:   typeof result.achievedResistance === 'number' ? result.achievedResistance : undefined,
    risicoklasse:       typeof calc.risicoklasse === 'string' ? calc.risicoklasse : undefined,
    databron:           'BRO bodemdata, postcodeniveau, indicatief',
    berekend_op:        typeof calc.created_at === 'string' ? calc.created_at : undefined,
  };
}
