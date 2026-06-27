/**
 * Literatuurpriors (L1) — bevroren referentie.
 *
 * Dit zijn de NL-gekalibreerde startwaarden voor rhoWet per lithoClass.
 * Bron: EarthGND Fase 0 veldmetingen 2026-06 (n=20) + literatuur.
 *
 * NOOIT aanpassen — dit zijn de ankers voor de hiërarchische posterior.
 * De pipeline gebruikt lib/pipeline/rho-priors.ts (identieke μ-waarden).
 * Dit bestand voegt σ en n_virtual toe voor het Bayesiaanse model.
 *
 * σ encodeert: hoe breed is de ρ-spreiding binnen deze klasse?
 * n_virtual encodeert: hoe snel mag velddata de literatuur overschrijven?
 *   - Laag (1–2): veld overschrijft snel (extrapolatie, onzekere bron)
 *   - Hoog (4–5): veld moet meer bewijs leveren (goede literatuuronderbouwing)
 */

export interface LiteraturePrior {
  mu: number;        // centrale ρ_wet schatting (Ω·m)
  sigma: number;     // spreiding literatuur (Ω·m, lineaire ruimte)
  nVirtual: number;  // virtuele steekproef — hoe snel overschrijft veld dit?
}

/** Per lithoClass literatuurprior. Identieke μ aan NL_RHO_WET_PRIOR. */
export const LITERATURE_PRIOR: Record<number, LiteraturePrior> = {
  1: { mu: 10,  sigma: 5,  nVirtual: 3 }, // klei:  NEN 60364-5-54 Annex B 8–15 Ω·m
  2: { mu: 20,  sigma: 10, nVirtual: 2 }, // leem:  extrapolatie 2.8×, geen NL meting (±50%)
  3: { mu: 45,  sigma: 15, nVirtual: 5 }, // zand:  IJmuiden ~43 + Amersfoort ~52 Ω·m (n=20)
  4: { mu: 110, sigma: 55, nVirtual: 1 }, // grind: extrapolatie ⚠ ONVERGELIJKT — leer geblokkeerd
  5: { mu: 10,  sigma: 4,  nVirtual: 4 }, // veen:  CROW/TNO NL laagveen geo.mean ~10 Ω·m
};

/**
 * Log-ruimte relatieve onzekerheid per klasse.
 * Gebruikt door estimateClassDistribution() als breedte van de lognormale likelihood.
 * Encodeert: hoe breed is de ρ-spreiding BINNEN deze klasse (niet de absolute waarde)?
 */
export const CLASS_LOG_SIGMA: Record<number, number> = {
  1: 0.50, // klei:  breed (mariene vs. rivierklei, drainage)
  2: 0.55, // leem:  breed (weinig NL data)
  3: 0.40, // zand:  redelijk geconcentreerd (NL pleistoceen/holocene zand)
  4: 0.65, // grind: zeer breed (schoon vs. kleiig grind, diepte)
  5: 0.40, // veen:  geconcentreerd (NL laagveen dominant)
};

/** Minimale soft_n drempel voor het activeren van een geleerde prior. */
export const MIN_SOFT_N_GLOBAL = 5;    // L2: minstens 5 effectieve metingen
export const MIN_SOFT_N_REGIONAL = 3;  // L3: minstens 3 (regionaal schaarser)

/** lithoClass=4 (grind) — learning altijd geblokkeerd tot handmatige opheffing. */
export const GRIND_CLASS = 4;
