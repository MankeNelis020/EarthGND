/**
 * Stage 6.5 — Empirische prior lookup (async, vóór runKernel).
 *
 * Volgorde:
 *   L3 regionaal (5km RD-grid) → als soft_n >= MIN_SOFT_N_REGIONAL
 *   L2 globaal (per lithoClass) → als soft_n >= MIN_SOFT_N_GLOBAL
 *   L1 literatuur               → statische NL_RHO_WET_PRIOR (huidig gedrag)
 *
 * De posterior wordt berekend via computeSafePosterior (L1 + finest level).
 * Pas L3 toe als er RD-coördinaten beschikbaar zijn (via postcode geocoding),
 * anders alleen L2.
 *
 * Geeft altijd een getal terug — nooit null. Veilig als drop-in voor resolveRhoWet.
 */

import { createClient } from '@supabase/supabase-js';
import {
  getLiteratureLevel,
  welfordToLevel,
  computeSafePosterior,
} from '@/lib/soil-knowledge/bayesian-posterior';
import { MIN_SOFT_N_GLOBAL, MIN_SOFT_N_REGIONAL } from '@/lib/soil-knowledge/priors';
import { NL_RHO_WET_PRIOR } from './rho-priors';
import type { WelfordState } from '@/lib/soil-knowledge/types';

export type EmpiricalPriorSource = 'l3_regional' | 'l2_global' | 'l1_literature';

export interface EmpiricalRhoWet {
  rhoWet: number;
  source: EmpiricalPriorSource;
  posteriorMu?: number;
  posteriorSigma?: number;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** 5km RD-grid snapping (zelfde als in processMeting) */
function snapToGrid(v: number, step = 5000): number {
  return Math.round(v / step) * step;
}

export async function resolveEmpiricalRhoWet(
  lithoClass:  number | null | undefined,
  rhoFallback: number,
  rdX?:        number | null,
  rdY?:        number | null,
): Promise<EmpiricalRhoWet> {
  // Geen lithoClass → geen klassespecifieke prior, gebruik ratio-fallback
  if (lithoClass == null) {
    return { rhoWet: Math.round(rhoFallback * 0.45), source: 'l1_literature' };
  }

  const l1 = getLiteratureLevel(lithoClass);

  let supabase: ReturnType<typeof getServiceClient> | null = null;
  try {
    supabase = getServiceClient();
  } catch {
    // Geen service-role key beschikbaar (bijv. lokaal dev) → L1 fallback
    const l1Rho = NL_RHO_WET_PRIOR[lithoClass] ?? l1.mu;
    return { rhoWet: l1Rho, source: 'l1_literature' };
  }

  // ── L3: regionale prior (5km grid) ──────────────────────────────────────────
  if (rdX != null && rdY != null) {
    const gx = snapToGrid(rdX);
    const gy = snapToGrid(rdY);

    const { data: regional } = await supabase
      .from('regional_prior')
      .select('total_weight, welford_mean, welford_m2')
      .eq('litho_class', lithoClass)
      .eq('rd_grid_x', gx)
      .eq('rd_grid_y', gy)
      .maybeSingle();

    if (regional) {
      const l3 = welfordToLevel(regional as WelfordState, MIN_SOFT_N_REGIONAL);
      if (l3) {
        const posterior = computeSafePosterior(l1, null, l3, null);
        return {
          rhoWet:        Math.round(posterior.mu),
          source:        'l3_regional',
          posteriorMu:   posterior.mu,
          posteriorSigma: posterior.sigma,
        };
      }
    }
  }

  // ── L2: globale prior (heel NL, per klasse) ───────────────────────────────
  const { data: global } = await supabase
    .from('global_prior')
    .select('total_weight, welford_mean, welford_m2')
    .eq('litho_class', lithoClass)
    .maybeSingle();

  if (global) {
    const l2 = welfordToLevel(global as WelfordState, MIN_SOFT_N_GLOBAL);
    if (l2) {
      const posterior = computeSafePosterior(l1, l2, null, null);
      return {
        rhoWet:        Math.round(posterior.mu),
        source:        'l2_global',
        posteriorMu:   posterior.mu,
        posteriorSigma: posterior.sigma,
      };
    }
  }

  // ── L1: statische NL literatuurprior (huidig gedrag) ─────────────────────
  const l1Rho = NL_RHO_WET_PRIOR[lithoClass] ?? l1.mu;
  return { rhoWet: l1Rho, source: 'l1_literature' };
}
