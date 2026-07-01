/**
 * Stage 9 — UI-explanation layer (one source of truth).
 *
 * All user-facing text, badges and warnings are generated HERE.
 * No other part of the codebase produces explanation text independently.
 * This eliminates contradictions between corrosion block, risk text, and GW/GHG labels.
 *
 * Two known inconsistencies fixed here:
 *   1. "lage corrosiekans" risk-class text was contradicting the corrosion block — now aligned.
 *   2. GW vs GHG naming — unified to "GHG (hoogste grondwaterstand)" everywhere.
 */

import type { KernelResult } from './kernel-adapter';
import type { SourceConfidence, PlausibilityFlag, UncertaintyBand, LocalDepthHintEnrichment } from './types';
import { confidenceSummary } from './confidence';
import { formatElectrodeDiameterLabel, isNonStandardElectrodeDiameterMm } from '@/lib/electrode-diameter';

export interface UIExplanation {
  warnings:   string[];   // Actionable warnings shown in a yellow box
  info:       string[];   // Informational lines (no action needed)
  sourceLine: string;     // "Herkomst: CPT-sondering op 120 m · Zekerheid: Hoog"
  bandLine:   string;     // "Verwacht bereik (gemiddeld scenario): 20–35 m diep"
  gwLabel:    string;     // Canonical GHG label for use in all three scenario cards
}

export function buildExplanation(
  result:      KernelResult,
  confidence:  SourceConfidence,
  plausFlags:  PlausibilityFlag[],
  band:        UncertaintyBand,
  targetResistance: number,
  localDepthHint?: LocalDepthHintEnrichment | null,
  rhoWetSource?: string,
  electrodeDiameterMm?: number,
): UIExplanation {
  const warnings: string[] = [];
  const info:     string[] = [];

  // ─── Plausibility warnings (light flags; heavy flags blocked upstream) ────
  for (const f of plausFlags.filter(f => f.severity === 'light')) {
    warnings.push(`⚠ ${f.message}`);
  }

  // ─── Source/confidence ────────────────────────────────────────────────────
  const sourceLine = confidenceSummary(confidence);
  if (confidence.level === 'laag') {
    warnings.push(
      'Zekerheid laag: de bodemgegevens zijn generiek of ver van locatie. ' +
      'Gebruik de band hieronder als leidraad en verifieer ter plaatse (NEN 3140).',
    );
  } else if (confidence.level === 'midden') {
    info.push('Zekerheid gemiddeld: aanbevolen om ter plaatse te meten na installatie (NEN 3140).');
  }

  // ─── Fix inconsistency 1: corrosion-risk alignment ───────────────────────
  // The risk class description "lage corrosiekans" only makes sense if the corrosion
  // class confirms it. Emit a reconciled note when they match or differ.
  const riskColor    = result.riskClass.color;
  const corrosColor  = result.corrosionClass.color;
  if ((riskColor === 'green' || riskColor === 'yellow') && (corrosColor === 'orange' || corrosColor === 'red')) {
    warnings.push(
      'Let op: de risicoklasse is gunstig (bodem), maar de corrosieclassificatie is ongunstig (pH). ' +
      'Gebruik corrosiebestendig materiaal conform de corrosieclassificatie.',
    );
  }

  // ─── GHG label (fix inconsistency 2) ─────────────────────────────────────
  // Canonical: GHG = hoogste grondwaterstand (natte periode). The "+1.5 m" and "+3.0 m"
  // variants are SEASONAL ESTIMATES, not measured values.
  const gwLabel = 'GHG (hoogste grondwaterstand, natte periode)';

  // ─── Empirische kennis (L2/L3/L4) ─────────────────────────────────────────
  if (rhoWetSource && rhoWetSource !== 'l1_literature') {
    const srcLabel: Record<string, string> = {
      l4_local:             'lokale veldmetingen (≤500 m)',
      l3_regional_agnostic: 'regionale veldmetingen (5×5 km)',
      l3_regional:          'regionale klassekennis',
      l2_global:            'Nederlandse veldmetingen (per grondtype)',
    };
    info.push(
      `Natte bodemweerstand verfijnd via ${srcLabel[rhoWetSource] ?? rhoWetSource}.`,
    );
  }

  if (localDepthHint && localDepthHint.n >= 1) {
    const locLabel = localDepthHint.source === 'exact_address'
      ? 'op dit adres'
      : `binnen ${localDepthHint.maxDistanceM} m`;
    info.push(
      `Lokale referentie ${locLabel}: ${localDepthHint.n} eerdere meting${localDepthHint.n > 1 ? 'en' : ''}, ` +
      `gemiddeld ~${localDepthHint.medianDepthM.toFixed(1)} m diepte.`,
    );
  }

  // ─── Non-convergence warning ──────────────────────────────────────────────
  const ongunstig = result.scenarios.ongunstig as { converged?: boolean };
  if ('converged' in ongunstig && ongunstig.converged === false) {
    warnings.push(
      `Doelweerstand ≤ ${targetResistance} Ω is niet haalbaar binnen 100 m in het ongunstige scenario. ` +
      'Overweeg een aardlekschakelaar (30 mA → max 1667 Ω, 300 mA → 167 Ω), een aardmat, of meerdere pennen in een betere grondzone.',
    );
  }

  // ─── Uncertainty band line ────────────────────────────────────────────────
  const unit = result.electrodeType === 'lint' ? 'm lint' : 'm diep';
  const bandLine =
    `Verwacht bereik ρ-bandbreedte (gemiddeld scenario): ${band.low.toFixed(1)}–${band.high.toFixed(1)} ${unit} ` +
    `(ρ × ${band.rhoFactorLow}–${band.rhoFactorHigh})`;

  // ─── Electrode diameter ───────────────────────────────────────────────────
  if (result.electrodeType === 'pen' && electrodeDiameterMm != null) {
    info.push(`Elektrodediameter: ${formatElectrodeDiameterLabel(electrodeDiameterMm)}.`);
    if (isNonStandardElectrodeDiameterMm(electrodeDiameterMm)) {
      info.push(
        'Niet-standaard diameter: elektrische weerstand en haalbare indrijfdiepte wijken af van een ⌀ 14 mm grondpen.',
      );
    }
  }

  // ─── Methodology reminder ─────────────────────────────────────────────────
  info.push('Meet altijd ter plaatse na installatie conform NEN 3140.');

  return { warnings, info, sourceLine, bandLine, gwLabel };
}
