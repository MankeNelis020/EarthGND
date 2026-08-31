/**
 * Cockpit instruments — derived from gate completion + evidence, not arbitrary styling.
 */

import type { CurrentGateLabel, GateStatusLevel } from './gate-config';
import { POORT2, POORT3 } from './gate-config';
import type { OosSummary } from './oos';
import type { ProductionEmpiricalState } from './production-state';
import type { EvidenceStrengthResult } from './evidence-strength';

export type Poort2Snapshot = {
  shadowCount: number;
  groundTruthedCount: number;
  medianRelErrorPct: number | null;
  depthGate: 'PASS' | 'FAIL' | 'NOT_ENOUGH_DATA' | 'UNKNOWN';
  depthGeoMeanMax: number | null;
};

export type CockpitInput = {
  production: ProductionEmpiricalState;
  poort2: Poort2Snapshot;
  oos: OosSummary | null;
  evidenceStrength: EvidenceStrengthResult | null;
  theoryEmpiricalAgreement01: number | null;
  policyEnabledAny: boolean;
  humanApproved: boolean;
};

export type CockpitInstruments = {
  productionEmpiricalPercent: number;
  productionSubtext: string;
  validationReadinessPercent: number;
  fieldEvidenceStrengthPercent: number | null;
  theoryEmpiricalAgreementPercent: number | null;
  currentGate: CurrentGateLabel;
  gateStatusLevel: GateStatusLevel;
  readinessBreakdown: { label: string; done: boolean; weight: number }[];
};

export function computeValidationReadiness(input: CockpitInput): {
  percent: number;
  breakdown: { label: string; done: boolean; weight: number }[];
  level: GateStatusLevel;
  gate: CurrentGateLabel;
} {
  const breakdown = [
    {
      label: 'Poort 2 shadow logging actief',
      done: input.poort2.shadowCount > 0,
      weight: 15,
    },
    {
      label: 'Poort 2 ground truth aanwezig',
      done: input.poort2.groundTruthedCount > 0,
      weight: 15,
    },
    {
      label: 'Poort 2 dieptegate ≤ 1.30',
      done: input.poort2.depthGate === 'PASS',
      weight: 20,
    },
    {
      label: 'Poort 3 OOS folds beschikbaar',
      done: (input.oos?.folds.length ?? 0) > 0,
      weight: 15,
    },
    {
      label: 'Poort 3 technische criteria',
      done: input.oos?.passedTechnical === true,
      weight: 25,
    },
    {
      label: 'Menselijke review / policy enabled',
      done: input.policyEnabledAny || input.humanApproved,
      weight: 10,
    },
  ];

  const earned = breakdown.filter(b => b.done).reduce((s, b) => s + b.weight, 0);
  const percent = earned;

  let level: GateStatusLevel = 'INSUFFICIENT_DATA';
  if (input.poort2.shadowCount === 0) level = 'INSUFFICIENT_DATA';
  else if (input.poort2.groundTruthedCount === 0) level = 'BUILDING_EVIDENCE';
  else if (!input.oos || input.oos.folds.length === 0) level = 'VALIDATING';
  else if (!input.oos.passedTechnical) level = 'VALIDATING';
  else if (!input.humanApproved && !input.policyEnabledAny) level = 'PASSING_TECHNICAL_GATES';
  else level = 'ELIGIBLE_FOR_HUMAN_REVIEW';

  let gate: CurrentGateLabel = 'POORT_2_SHADOW';
  if (input.humanApproved && input.production.productionEmpiricalPercent > 0) {
    gate = 'PRODUCTION_APPROVED';
  } else if (input.policyEnabledAny) {
    gate = 'POORT_4_CONTROLLED_ACTIVATION';
  } else if (level === 'ELIGIBLE_FOR_HUMAN_REVIEW' || level === 'PASSING_TECHNICAL_GATES') {
    gate = 'ELIGIBLE_FOR_REVIEW';
  } else if (input.poort2.groundTruthedCount > 0) {
    gate = 'POORT_3_OOS_VALIDATION';
  }

  // Never auto-promote to PRODUCTION_APPROVED without explicit humanApproved + live influence
  if (gate === 'PRODUCTION_APPROVED' && !input.humanApproved) {
    gate = 'ELIGIBLE_FOR_REVIEW';
  }

  return { percent, breakdown, level, gate };
}

export function buildCockpit(input: CockpitInput): CockpitInstruments {
  const readiness = computeValidationReadiness(input);
  return {
    productionEmpiricalPercent: input.production.productionEmpiricalPercent,
    productionSubtext: input.production.subtext,
    validationReadinessPercent: readiness.percent,
    fieldEvidenceStrengthPercent: input.evidenceStrength?.combined ?? null,
    theoryEmpiricalAgreementPercent:
      input.theoryEmpiricalAgreement01 != null
        ? Math.round(input.theoryEmpiricalAgreement01 * 1000) / 10
        : null,
    currentGate: readiness.gate,
    gateStatusLevel: readiness.level,
    readinessBreakdown: readiness.breakdown,
  };
}

export function depthGateFromGeoMeans(
  geoMeans: number[],
): Poort2Snapshot['depthGate'] {
  if (!geoMeans.length) return 'NOT_ENOUGH_DATA';
  return geoMeans.every(g => g <= POORT2.maxGeoMeanDepthFactor) ? 'PASS' : 'FAIL';
}

export { POORT3 };
