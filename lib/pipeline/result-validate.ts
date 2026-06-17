/**
 * Stage 7 — Result validation (Error class D).
 *
 * Catches non-finite kernel outputs despite valid input → system bug, not user error.
 * On class D: release the credit reservation, log as bug, return error.
 *
 * The `ResultValidation` shape is the NAAD (seam) for Flow B:
 * haalbaarheidsgrens, depth feasibility, z_req vs z_max etc. plug in here
 * without touching the kernel or any other pipeline stage.
 */

import type { KernelResult } from './kernel-adapter';
import type { ResultValidation, PipelineError } from './types';

type ResultCheckOk   = { ok: true;  validation: ResultValidation };
type ResultCheckFail = { ok: false; validation: ResultValidation; error: PipelineError };
type ResultCheck     = ResultCheckOk | ResultCheckFail;

function isDimFinite(s: { depth?: number; length?: number; achievedResistance: number }): boolean {
  const dim = s.depth ?? s.length ?? 0;
  return Number.isFinite(dim) && Number.isFinite(s.achievedResistance);
}

export function validateResult(result: KernelResult): ResultCheck {
  const { scenarios } = result;

  const allFinite =
    isDimFinite(scenarios.gunstig   as { depth?: number; length?: number; achievedResistance: number }) &&
    isDimFinite(scenarios.gemiddeld as { depth?: number; length?: number; achievedResistance: number }) &&
    isDimFinite(scenarios.ongunstig as { depth?: number; length?: number; achievedResistance: number }) &&
    Number.isFinite(result.rhoDry) &&
    Number.isFinite(result.rhoWet);

  const validation: ResultValidation = {
    allFinite,
    // Future Flow B fields:
    // haalbaarheidsgrensGehaald: undefined,
    // feasibleDepthReached: undefined,
  };

  if (!allFinite) {
    return {
      ok: false,
      validation,
      error: {
        errorClass: 'D',
        message:
          'De berekening kon technisch niet betrouwbaar worden afgerond. ' +
          'Er is geen credit afgeschreven. Probeer opnieuw of meld dit via earthgnd.com.',
        technicalDetail: 'Non-finite value in kernel output despite valid input — this is a bug.',
      },
    };
  }

  return { ok: true, validation };
}
