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

import type { RawDiepteInput, PipelineResult, PipelineEnrichment, EmpiricalBlendInfo } from './types';
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
import { resolveActivePrior, type ActivePriorSource } from '@/lib/soil-knowledge/active-prior';
import { lookupPostcode } from '@/lib/pdok';
import { resolveRhoWet } from './rho-priors';
import {
  isEmergencyRollback,
  getEmpiricalWeight,
  getConfidenceThreshold,
  isLithoClassEnabled,
  sourceToConfidence,
} from '@/lib/soil-knowledge/config';

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

  // ── Stage 6.5: Actieve rhoWet prior (L2 globaal + L3 regionaal) ─────────
  //
  // Poort D blend-logica:
  //   1. EMERGENCY_ROLLBACK=true → direct L1, geen lookup
  //   2. Geocodeer postcode → RD-coördinaten (PDOK, gecached 24h, timeout 3s)
  //   3. Probeer L3 class-agnostisch → L3 per-klasse → L2 globaal → L1
  //   4. Als klasse enabled EN confidence ≥ drempel → blend (weight=EMPIRICAL_WEIGHT)
  //   5. Anders → blijf op L1 (geen rhoWetOverride)
  //
  // Alle stappen zijn niet-kritiek: fout → L1 (identiek aan oud gedrag).
  let rhoWetSource: ActivePriorSource = 'l1_literature';
  let localDepthHint = null as import('./types').LocalDepthHintEnrichment | null;
  let empiricalBlend: EmpiricalBlendInfo | null = null;

  // Stap 1: RD + WGS84 via postcode-geocoding (server-side, gecached)
  let rdX: number | null = null;
  let rdY: number | null = null;
  let lat: number | null = null;
  let lon: number | null = null;
  const huisnummer = input.huisnummer;

  if (input.postcode) {
    try {
      const geo = await lookupPostcode(input.postcode, huisnummer);
      rdX = Math.round(geo.rdX);
      rdY = Math.round(geo.rdY);
      lat = geo.lat;
      lon = geo.lon;
    } catch {
      // Geocoding mislukt → door zonder coördinaten (L3/L4 niet beschikbaar)
    }
  }

  // Stap 2: Active prior lookup + Poort D blend
  if (isEmergencyRollback()) {
    // Noodstop — alle berekeningen vallen terug op L1, geen DB-lookup
    console.info('[pipeline/poort-d] EMERGENCY_ROLLBACK actief — L1 wordt gebruikt');
  } else {
    try {
      const active = await resolveActivePrior(
        input.lithoClass, input.rho, rdX, rdY, lat, lon,
        input.postcode, huisnummer,
      );
      rhoWetSource = active.source;
      localDepthHint = active.localDepthHint ?? null;

      if (
        active.source !== 'l1_literature' &&
        isLithoClassEnabled(input.lithoClass)
      ) {
        const confidence  = sourceToConfidence(active.source);
        const l1Rho       = resolveRhoWet(input.lithoClass, input.rho);

        if (confidence >= getConfidenceThreshold()) {
          // Blend: empirisch × weight + L1 × (1-weight)
          const weight     = getEmpiricalWeight();
          const blendedRho = Math.round(active.rhoWet * weight + l1Rho * (1 - weight));
          (input as { rhoWetOverride?: number }).rhoWetOverride = blendedRho;

          empiricalBlend = {
            empiricalRho:    active.rhoWet,
            l1Rho,
            blendedRho,
            empiricalWeight: weight,
            confidence,
            source:          active.source,
            blendApplied:    true,
          };
        } else {
          // Confidence te laag — log voor monitoring, blijf op L1
          const l1Rho = resolveRhoWet(input.lithoClass, input.rho);
          empiricalBlend = {
            empiricalRho:    active.rhoWet,
            l1Rho,
            blendedRho:      l1Rho,
            empiricalWeight: 0,
            confidence,
            source:          active.source,
            blendApplied:    false,
          };
        }
      }
    } catch (e) {
      console.warn('[pipeline/active-prior] lookup mislukt, gebruik L1:', e);
    }
  }

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
      localDepthHint,
      rhoWetSource,
      input.electrodeDiameterMm,
    );

    // ── Capture credit ────────────────────────────────────────────────────────
    await reservation.capture();

    const enrichment: PipelineEnrichment = {
      confidence,
      plausibilityFlags: plausibility.flags,
      warnings:          [...explanation.warnings, ...explanation.info],
      uncertaintyBand:   band,
      resultValidation:  resultCheck.validation,
      rhoWetSource,
      localDepthHint,
      empiricalBlend,
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
