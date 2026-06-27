/**
 * Shadow mode logging — per berekening L1+L2 posterior vergelijken met L1 alleen.
 *
 * Doel: valideer de empirische prior vóór de productiepoort-beslissing.
 *   - empirical_weight = 0 → L1 is altijd de actieve output (geen impact op gebruiker)
 *   - shadow_predictions logt de posterior zodat we zien hoe L2 afwijkt van L1
 *   - actual_rho wordt ingevuld zodra een confirmed meting op dezelfde locatie binnenkomt
 *
 * Fire-and-forget: aanroepers awaiten niet — fouten worden gelogd maar blokkeren nooit.
 */

import { createClient } from '@supabase/supabase-js';
import { getLiteratureLevel, welfordToLevel, computeSafePosterior } from './index';
import { MIN_SOFT_N_GLOBAL } from './priors';
import type { WelfordState } from './types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE env vars niet geconfigureerd');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Logt een shadow prediction voor de gegeven berekening.
 *
 * Leest L2 (global_prior) voor de lithoClass en berekent de posterior.
 * L3/L4 worden niet gelezen — de calculate route heeft geen lat/lon.
 *
 * @param calculationId UUID van de calculations-rij
 * @param lithoClass    BRO lithoClass (1–5) of null als onbekend
 */
export async function logShadowPrediction(
  calculationId: string,
  lithoClass: number | null | undefined,
): Promise<void> {
  if (!lithoClass) return;

  const supabase = getServiceClient();

  // L1 — bevroren literatuurprior
  const l1 = getLiteratureLevel(lithoClass);

  // L2 — globale klassekennis (Welford accumulatie)
  const { data: globalRow } = await supabase
    .from('global_prior')
    .select('total_weight, welford_mean, welford_m2')
    .eq('litho_class', lithoClass)
    .maybeSingle();

  const welfordState: WelfordState = globalRow ?? {
    total_weight: 0,
    welford_mean: 0,
    welford_m2: 0,
  };
  const l2 = welfordToLevel(welfordState, MIN_SOFT_N_GLOBAL);

  // Posterior (L3/L4 = null: calculate-route heeft geen GPS)
  const posterior = computeSafePosterior(l1, l2, null, null);

  await supabase.from('shadow_predictions').insert({
    calculation_id:  calculationId,
    l1_mu:           l1.mu,
    l1_sigma:        l1.sigma,
    l1_n:            l1.n,
    l2_mu:           l2?.mu    ?? null,
    l2_sigma:        l2?.sigma ?? null,
    l2_n:            l2?.n     ?? null,
    l3_mu:           null,
    l3_sigma:        null,
    l3_n:            null,
    l4_mu:           null,
    l4_sigma:        null,
    l4_n:            null,
    posterior_mu:    posterior.mu,
    posterior_sigma: posterior.sigma,
    empirical_weight: 0,
  });
}
