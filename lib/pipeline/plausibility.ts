/**
 * Stage 4 — Plausibility scan (Error class B).
 * Input is valid but may be suspicious → flag, tier, and decide if confirmation is needed.
 *
 * Two tiers:
 *   light  — proceed immediately, show warning in result
 *   heavy  — stop before credit reserve; client must re-POST with confirmed=true
 */

import type { ValidatedDiepteInput } from './parse';
import type { PlausibilityFlag, PlausibilityResult } from './types';
import { PLAUSIBILITY_THRESHOLDS as T } from './config';

export function checkPlausibility(
  input: ValidatedDiepteInput,
  confirmed: boolean,
): PlausibilityResult {
  const flags: PlausibilityFlag[] = [];

  // ─── ρ checks ─────────────────────────────────────────────────────────────

  if (input.rho < T.rhoMin) {
    // This should have been caught by validate.ts; belt-and-suspenders
    flags.push({
      field: 'rho', value: input.rho,
      message: `Bodemweerstand ρ = ${input.rho} Ω·m is fysisch onmogelijk (metaalwaarden).`,
      severity: 'heavy',
    });
  } else if (input.rho > T.rhoMaxHeavy) {
    flags.push({
      field: 'rho', value: input.rho,
      message:
        `Je voert ρ = ${input.rho.toLocaleString('nl-NL')} Ω·m in — dit is extreem hoog. ` +
        `Bedoel je echt ${input.rho.toLocaleString('nl-NL')} en niet ${Math.round(input.rho / 1000)}?`,
      severity: 'heavy',
    });
  } else if (input.rho > T.rhoMaxLight) {
    flags.push({
      field: 'rho', value: input.rho,
      message: `Bodemweerstand ρ = ${input.rho} Ω·m is ongebruikelijk hoog (rots/droog grind). Controleer de waarde.`,
      severity: 'light',
    });
  }

  // ─── GHG groundwater depth ────────────────────────────────────────────────

  if (input.groundwaterDepth > T.gwMaxHeavy) {
    flags.push({
      field: 'groundwaterDepth', value: input.groundwaterDepth,
      message:
        `GHG = ${input.groundwaterDepth} m is nagenoeg onmogelijk in Nederland (zandduinen max ~12 m). ` +
        `Bevestig dat je ${input.groundwaterDepth} m bedoelt.`,
      severity: 'heavy',
    });
  } else if (input.groundwaterDepth > T.gwMaxLight) {
    flags.push({
      field: 'groundwaterDepth', value: input.groundwaterDepth,
      message: `GHG = ${input.groundwaterDepth} m is ongebruikelijk diep voor NL (typisch 0–5 m). Verifieer ter plaatse.`,
      severity: 'light',
    });
  }

  // ─── Target resistance ────────────────────────────────────────────────────

  if (input.targetResistance < T.targetMinLight) {
    flags.push({
      field: 'targetResistance', value: input.targetResistance,
      message:
        `Doelweerstand ${input.targetResistance} Ω vereist een specialistisch systeem (aardmatten, ` +
        `meerdere diepboringen) — zelden haalbaar met standaard aardpennen (NEN-EN 50522).`,
      severity: 'light',
    });
  }

  if (input.targetResistance > T.targetMaxLight) {
    flags.push({
      field: 'targetResistance', value: input.targetResistance,
      message:
        `Doelweerstand ${input.targetResistance} Ω overschrijdt gangbare normen ` +
        `(NEN 1010 max 167 Ω bij 300 mA, 1667 Ω bij 30 mA). Controleer of dit de juiste waarde is.`,
      severity: 'light',
    });
  }

  // ─── Determine overall severity ───────────────────────────────────────────

  const severity: 'none' | 'light' | 'heavy' =
    flags.some(f => f.severity === 'heavy') ? 'heavy' :
    flags.some(f => f.severity === 'light') ? 'light' :
    'none';

  // Confirmation required when heavy AND client hasn't confirmed yet
  const confirmationRequired = severity === 'heavy' && !confirmed;

  return { severity, flags, confirmationRequired };
}
