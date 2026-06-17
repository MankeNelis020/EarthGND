/**
 * runGroundingAssessment — main orchestrator.
 *
 * Processes a raw diepte-calculator API body through the full pipeline:
 *   Parse → Validate → Normalize → Plausibility → Confidence
 *   → Reserve credit → Kernel → Result-validate → Uncertainty → Explain
 *
 * Error classes:
 *   A — invalid input   → block before credit reserve
 *   B — suspicious      → light: proceed with warning / heavy: require confirmation
 *   C — low confidence  → proceed with label (never blocks)
 *   D — system failure  → release credit, log as bug
 *
 * The kernel (lib/calculations.ts) is NEVER modified by this file.
 */

import type { RawDiepteInput, PipelineResult, PipelineEnrichment } from './types';
import { parseDiepteInput }     from './parse';
import { validateDiepteInput }  from './validate';
import { normalizeDiepteInput } from './normalize';
import { checkPlausibility }    from './plausibility';
import { scoreConfidence }      from './confidence';
import { reserveCredit }        from './credit';
import { runKernel, type KernelResult } from './kernel-adapter';
import { validateResult }       from './result-validate';
import { computeUncertaintyBand } from './uncertainty';
import { buildExplanation }     from './explain';

export type { KernelResult };

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runGroundingAssessment(
  raw:    RawDiepteInput,
  userId: string,
): Promise<PipelineResult<KernelResult>> {

  // ── Stage 1: Parse ─────────────────────────────────────────────────────────
  const parsed = parseDiepteInput(raw);

  // ── Stage 2: Intake validation (class A) ───────────────────────────────────
  const validationResult = validateDiepteInput(parsed);
  if (!validationResult.ok) {
    return { ok: false, error: validationResult.error };
  }

  // ── Stage 3: Semantic normalization ────────────────────────────────────────
  const input = normalizeDiepteInput(validationResult.input);

  // ── Stage 4: Plausibility scan (class B) ───────────────────────────────────
  const plausibility = checkPlausibility(input, parsed.confirmed);

  if (plausibility.confirmationRequired) {
    // Heavy suspicious: stop here, no credit reserved. Client must confirm.
    const primaryFlag = plausibility.flags.find(f => f.severity === 'heavy');
    return {
      ok: false,
      confirmationRequired: true,
      error: {
        errorClass: 'B_confirm',
        message:    primaryFlag?.message ?? 'Bevestig de invoerwaarden voordat de berekening start.',
        field:      primaryFlag?.field,
      },
    };
  }

  // ── Stage 5: Confidence scoring (class C — never blocks) ───────────────────
  const confidence = scoreConfidence(input);

  // ── Stage 6: Reserve credit ────────────────────────────────────────────────
  const reserveResult = await reserveCredit(userId);
  if (!reserveResult.ok) {
    return {
      ok: false,
      error: {
        errorClass: 'A', // treat insufficient credits as blocking without errorClass D
        message:    reserveResult.message,
      },
      creditsRemaining: reserveResult.remaining,
    };
  }

  const { reservation, remaining: reservedRemaining } = reserveResult;

  try {
    // ── Stage 7: Kernel (pure, unmodified) ───────────────────────────────────
    const kernelResult = runKernel(input);

    // ── Stage 8: Result validation (class D) ─────────────────────────────────
    const resultCheck = validateResult(kernelResult);
    if (!resultCheck.ok) {
      await reservation.release();
      console.error('[pipeline] Class D — kernel returned non-finite values:', resultCheck.error.technicalDetail);
      return {
        ok: false,
        error: resultCheck.error,
        creditsRemaining: reservedRemaining + 1, // refunded
      };
    }

    // ── Stage 9: Uncertainty band ─────────────────────────────────────────────
    const band = computeUncertaintyBand(input, confidence.level);

    // ── Stage 10: UI-explanation layer ────────────────────────────────────────
    const explanation = buildExplanation(
      kernelResult,
      confidence,
      plausibility.flags,
      band,
      input.targetResistance,
    );

    // ── Capture credit ────────────────────────────────────────────────────────
    await reservation.capture();

    const enrichment: PipelineEnrichment = {
      confidence,
      plausibilityFlags: plausibility.flags,
      warnings:          explanation.warnings,
      uncertaintyBand:   band,
      resultValidation:  resultCheck.validation,
    };

    return {
      ok: true,
      data: kernelResult,
      enrichment,
      creditsRemaining: reservedRemaining,
    };

  } catch (err) {
    // Unexpected exception — release credit, surface as class D
    try { await reservation.release(); } catch { /* best effort */ }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pipeline] Unexpected error:', msg);
    return {
      ok: false,
      error: {
        errorClass:      'D',
        message:         'Er is een onverwachte fout opgetreden. Er is geen credit afgeschreven.',
        technicalDetail: msg,
      },
      creditsRemaining: reservedRemaining + 1,
    };
  }
}
