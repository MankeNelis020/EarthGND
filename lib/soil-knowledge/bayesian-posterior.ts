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

import { LITERATURE_PRIOR, MIN_SOFT_N_GLOBAL, MIN_SOFT_N_REGIONAL, GRIND_CLASS } from './priors';
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

// ─── Veilig niveau-selectie (vermijdt double counting) ───────────────────────

/**
 * Kiest het FIJNSTE niveau met voldoende data en combineert veilig met L1.
 *
 * Volgorde: L4 > L3 > L2 > L1
 * Combineert geselecteerd niveau ALLEEN met L1 (onafhankelijk van velddata).
 *
 * Dit is de aanbevolen combinatiestrategie totdat het hiërarchische model
 * via shadow mode gevalideerd is.
 *
 * @param l1 Literatuurprior (altijd aanwezig)
 * @param l2 Globale klassekennis (null als onvoldoende data)
 * @param l3 Regionale prior (null als onvoldoende data)
 * @param l4 Lokale observaties (null als geen data in radius)
 */
export function computeSafePosterior(
  l1: LevelEstimate,
  l2: LevelEstimate | null,
  l3: LevelEstimate | null,
  l4: LevelEstimate | null,
): PosteriorResult {
  // Selecteer fijnste niveau met data
  const finest = l4 ?? l3 ?? l2;

  // Combineer L1 + finest (onafhankelijk — L1 is literatuur, niet velddata)
  const posterior = finest
    ? computePosterior(l1, finest)
    : l1;

  return {
    ...posterior,
    breakdown: { l1, l2, l3, l4 },
  };
}

// ─── Actieve prior (stub — shadow mode nog niet actief) ──────────────────────

/**
 * Levert de actieve rhoWet prior voor lithoClass op een locatie.
 *
 * Huidige stand: empirical_weight = 0 (shadow mode).
 * Retourneert L1 literatuurprior — identiek aan huidige NL_RHO_WET_PRIOR.
 *
 * Toekomstige stand (na productiepoort):
 *   Leest L2/L3 uit database, voert computeSafePosterior uit.
 */
export function getActivePrior(
  lithoClass: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lat?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lon?: number,
): PosteriorResult {
  const l1 = getLiteratureLevel(lithoClass);
  // empirical_weight = 0 — geen database-aanroep
  return {
    mu: l1.mu,
    sigma: l1.sigma,
    n: l1.n,
    breakdown: { l1, l2: null, l3: null, l4: null },
  };
}

// ─── Grind-check helper ───────────────────────────────────────────────────────

/** True als learning geblokkeerd is voor deze klasse (grind = altijd true). */
export function isLearningBlocked(lithoClass: number): boolean {
  return lithoClass === GRIND_CLASS;
}
