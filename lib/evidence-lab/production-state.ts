/**
 * Read-only production empirical influence for Lab cockpit.
 * Does NOT change pipeline behavior.
 */

import { isSoilKnowledgeActive } from '@/lib/soil-knowledge/sheet-sync';
import { getEmpiricalWeight, isEmergencyRollback } from '@/lib/soil-knowledge/config';

export type ProductionEmpiricalState = {
  soilKnowledgeActive: boolean;
  emergencyRollback: boolean;
  envEmpiricalWeight: number;
  /** Live influence actually applied in pipeline (0–100). */
  productionEmpiricalPercent: number;
  subtext: string;
};

export function getProductionEmpiricalState(): ProductionEmpiricalState {
  const soilKnowledgeActive = isSoilKnowledgeActive();
  const emergencyRollback = isEmergencyRollback();
  const envEmpiricalWeight = getEmpiricalWeight();

  if (emergencyRollback || !soilKnowledgeActive) {
    return {
      soilKnowledgeActive,
      emergencyRollback,
      envEmpiricalWeight,
      productionEmpiricalPercent: 0,
      subtext: emergencyRollback
        ? 'Emergency rollback — productie theorie-only'
        : 'Production is still theory-only',
    };
  }

  return {
    soilKnowledgeActive,
    emergencyRollback,
    envEmpiricalWeight,
    productionEmpiricalPercent: Math.round(envEmpiricalWeight * 1000) / 10,
    subtext: `SOIL_KNOWLEDGE_ACTIVE — EMPIRICAL_WEIGHT=${envEmpiricalWeight}`,
  };
}
