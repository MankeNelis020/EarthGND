/**
 * Stage 2 — Intake validation (Error class A).
 * Hard yes/no: physically impossible → block immediately, NO credit reserved.
 * Returns a user-facing NL error message.
 */

import type { ParsedDiepteInput, ValidatedDiepteInput } from './parse';
import type { PipelineError } from './types';
import { buildValidated } from './parse';

type ValidationOk   = { ok: true;  input: ValidatedDiepteInput };
type ValidationFail = { ok: false; error: PipelineError };
type ValidationResult = ValidationOk | ValidationFail;

function err(field: string, message: string): ValidationFail {
  return { ok: false, error: { errorClass: 'A', message, field } };
}

export function validateDiepteInput(p: ParsedDiepteInput): ValidationResult {
  // Required numeric fields must be present and finite
  if (p.rho == null || p.rho <= 0) {
    return err('rho', 'Bodemweerstand ρ moet groter zijn dan 0 Ω·m — vul een geldige waarde in.');
  }
  if (!Number.isFinite(p.rho)) {
    return err('rho', 'Bodemweerstand ρ bevat een ongeldige waarde (NaN of oneindig).');
  }

  if (p.targetResistance == null || p.targetResistance <= 0) {
    return err('targetResistance', 'Doelweerstand Ra moet groter zijn dan 0 Ω.');
  }
  if (!Number.isFinite(p.targetResistance)) {
    return err('targetResistance', 'Doelweerstand Ra bevat een ongeldige waarde.');
  }

  if (p.groundwaterDepth == null || p.groundwaterDepth < 0) {
    return err('groundwaterDepth', 'Grondwaterstand (GHG) kan niet negatief zijn — vul een diepte in meters in.');
  }
  if (!Number.isFinite(p.groundwaterDepth)) {
    return err('groundwaterDepth', 'Grondwaterstand bevat een ongeldige waarde.');
  }

  if (p.ph != null && (!Number.isFinite(p.ph) || p.ph < 0 || p.ph > 14)) {
    return err('ph', 'Bodem pH moet tussen 0 en 14 liggen.');
  }

  // Electrode-specific checks
  if (p.electrodeType === 'lint') {
    if (p.lintBurialDepth != null && p.lintBurialDepth <= 0) {
      return err('lintBurialDepth', 'Ingraafdiepte lint moet groter zijn dan 0 m.');
    }
    if (p.lintConductorDiameter != null && p.lintConductorDiameter <= 0) {
      return err('lintConductorDiameter', 'Geleiderdiameter moet groter zijn dan 0 m.');
    }
  }

  // Optional override values, when present, must be valid
  if (p.rhoDryOverride != null) {
    if (!Number.isFinite(p.rhoDryOverride) || p.rhoDryOverride <= 0) {
      return err('rhoDryOverride', 'Droge-zone ρ overschrijving bevat een ongeldige waarde.');
    }
  }

  return { ok: true, input: buildValidated(p) };
}
