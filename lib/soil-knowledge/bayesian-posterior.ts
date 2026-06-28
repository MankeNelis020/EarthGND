/**
 * Bayesiaanse posterior — precisiegewogen combinatie van 4 niveaus.
 *
 * STATISTISCH VOORBEHOUD (zie ook: statistische review, 2026-06):
 *
 *   De directe precisieblend (p = n/σ²) veronderstelt ONAFHANKELIJKE schattingen.
 *   L2 (globaal), L3 (regionaal) en L4 (lokaal) delen echter deels hetzelfde bewijs
 *   (dezelfde metingen dragen bij aan meerdere niveaus). Dit leidt tot "double counting"
 *   en een te enge posterior (overconfident).
 *
 *   De correcte aanpak is een HIËRARCHISCH model:
 *     L1 → prior voor L2
 *     L2 posterior → prior voor L3 (met alleen regionale INCREMENTELE data)
 *     L3 posterior → prior voor L4 (met alleen lokale INCREMENTELE data)
 *
 *   Tot die aanpak gevalideerd is via shadow mode, geldt:
 *     - Gebruik ALLEEN het fijnste niveau met voldoende data
 *     - Combineer nooit L2+L3 of L3+L4 direct via precisieblend
 *     - L1 + één ander niveau is veilig (L1 is onafhankelijk van veld)
 *
 *   Zie: statistische-review.md voor volledige analyse en aanbeveling.
 */

import { LITERATURE_PRIOR, MIN_SOFT_N_GLOBAL, GRIND_CLASS } from './priors';
import type { LevelEstimate, PosteriorResult, WelfordState } from './types';

// ─── Utility: LevelEstimate uit literatuurprior ──────────────────────────────

export function getLiteratureLevel(lithoClass: number): LevelEstimate {
  const prior = LITERATURE_PRIOR[lithoClass] ?? LITERATURE_PRIOR[3];
  return { mu: prior.mu, sigma: prior.sigma, n: prior.nVirtual };
}

// ─── Utility: WelfordState → LevelEstimate ───────────────────────────────────

/**
 * Converteert Welford-accumulatie naar LevelEstimate.
 * Geeft null als er onvoldoende data is (total_weight < minN).
 */
export function welfordToLevel(
  state: WelfordState,
  minN: number = MIN_SOFT_N_GLOBAL,
): LevelEstimate | null {
  if (state.total_weight < minN) return null;
  if (state.welford_mean <= 0) return null;

  const sigma = state.total_weight > 1
    ? Math.sqrt(state.welford_m2 / state.total_weight)
    : Infinity;

  if (!isFinite(sigma) || sigma <= 0) return null;

  return {
    mu: state.welford_mean,
    sigma,
    n: state.total_weight,
  };
}

// ─── Precisiegewogen combinatie (onafhankelijke schattingen) ─────────────────

/**
 * Combineert onafhankelijke LevelEstimates tot een Bayesiaanse posterior.
 *
 * Formule (geldig voor onafhankelijke Gaussianen):
 *   precision_i = n_i / σ_i²
 *   posterior_μ = Σ(p_i × μ_i) / Σ p_i
 *   posterior_σ² = 1 / Σ p_i
 *
 * GEBRUIK BEPERKT tot combinaties van onafhankelijke schattingen:
 *   Veilig:   L1 + één van (L2, L3, L4)
 *   Onveilig: L2 + L3, L3 + L4, L2 + L3 + L4 (double counting)
 */
export function computePosterior(...levels: (LevelEstimate | null | undefined)[]): LevelEstimate {
  let totalPrecision = 0;
  let weightedSum = 0;
  let totalN = 0;

  for (const level of levels) {
    if (!level || level.n <= 0 || level.sigma <= 0 || !isFinite(level.mu) || !isFinite(level.sigma)) continue;
    const precision = level.n / (level.sigma * level.sigma);
    totalPrecision += precision;
    weightedSum += precision * level.mu;
    totalN += level.n;
  }

  if (totalPrecision === 0) {
    // Fallback: sand literatuurprior
    const lit = LITERATURE_PRIOR[3];
    return { mu: lit.mu, sigma: lit.sigma, n: lit.nVirtual };
  }

  return {
    mu: weightedSum / totalPrecision,
    sigma: Math.sqrt(1 / totalPrecision),
    n: totalN,
  };
}

// ─── Hiërarchische keten-posterior (aanbevolen) ──────────────────────────────

/**
 * Combineert vier niveaus via een hiërarchische keten — GEEN flat blend.
 *
 * Architectuur (conform statistische review 2026-06):
 *
 *   L2 posterior = posterior(L1, global)         ← literatuur + NL-leren
 *   L3 posterior = posterior(L2, regional delta) ← NL posterior + regio-leren
 *   L4 posterior = posterior(L3, local delta)    ← regio posterior + locatie-leren
 *
 * Elke laag gebruikt de VORIGE laag als prior en voegt alleen incrementele
 * informatie toe. Dit is architectonisch schoner dan een flat blend van vier
 * bronnen naar één gemiddelde.
 *
 *   Literatuur → Nederland leert → Regio leert → Locatie leert
 *
 * Technische noot (double counting L2/L3):
 *   L2 (globaal) en L3 (regionaal) delen deels dezelfde metingen.
 *   In stap 2 wordt L2 posterior als prior gebruikt met L3 als observatie.
 *   De overlap is beperkt (n_regionaal << n_globaal) en de precisiefformule
 *   begrenst de bijdrage van L3 automatisch via shrinkage.
 *   Correctie via expliciete delta-accumulatie volgt na shadow-validatie.
 *
 * @param l1 Literatuurprior — altijd aanwezig
 * @param l2 Globale NL klassekennis — null als soft_n < MIN_SOFT_N_GLOBAL
 * @param l3 Regionale prior — null als soft_n < MIN_SOFT_N_REGIONAL
 * @param l4 Lokale observaties — null als geen meting in radius
 */
export function computeChainPosterior(
  l1: LevelEstimate,
  l2: LevelEstimate | null,
  l3: LevelEstimate | null,
  l4: LevelEstimate | null,
): PosteriorResult {
  // Stap 1 — L1 (literatuur) + L2 (globale NL correctie)
  // L1 is de prior; global Welford is de observatie.
  // Volledig onafhankelijk: L1 is literatuur, L2 is velddata.
  const after_l2 = l2 ? computePosterior(l1, l2) : l1;

  // Stap 2 — L2 posterior + L3 (regionale verfijning)
  // L2 posterior is de prior; regionaal Welford voegt lokale afwijking toe.
  // Als L3 dicht bij L2 ligt → kleine correctie (shrinkage); ver weg → grotere.
  const after_l3 = l3 ? computePosterior(after_l2, l3) : after_l2;

  // Stap 3 — L3 posterior + L4 (lokale observaties)
  // L3 posterior is de prior; IDW-interpolatie van nabije metingen.
  // L4 heeft typisch weinig punten → begrensde bijdrage.
  const after_l4 = l4 ? computePosterior(after_l3, l4) : after_l3;

  return {
    ...after_l4,
    breakdown: { l1, l2, l3, l4 },
  };
}

/**
 * Niveau-selectie fallback (veilig, geen double counting).
 * Gebruikt het FIJNSTE beschikbare niveau + L1. Minder accuraat dan
 * computeChainPosterior maar volledig vrij van overlap-artefacten.
 *
 * Gebruik wanneer het onduidelijk is of L2/L3 data onafhankelijk is.
 */
export function computeSafePosterior(
  l1: LevelEstimate,
  l2: LevelEstimate | null,
  l3: LevelEstimate | null,
  l4: LevelEstimate | null,
): PosteriorResult {
  const finest = l4 ?? l3 ?? l2;
  const posterior = finest ? computePosterior(l1, finest) : l1;
  return { ...posterior, breakdown: { l1, l2, l3, l4 } };
}

// ─── Grind-check helper ───────────────────────────────────────────────────────

/** True als learning geblokkeerd is voor deze klasse (grind = altijd true). */
export function isLearningBlocked(lithoClass: number): boolean {
  return lithoClass === GRIND_CLASS;
}
