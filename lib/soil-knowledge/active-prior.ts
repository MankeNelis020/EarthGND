/**
 * Stage 6.5 — Actieve rhoWet resolver.
 *
 * Hiërarchie (fijnste niveau wint):
 *
 *   L3-agnostisch  — gewogen gemiddelde van ALLE klassen in 5km-rastercel
 *                    Werkt ook als BRO-klasse verkeerd is (bijv. kust-klei vs. zand)
 *   L3-per-klasse  — regionale Welford per (cel, lithoClass) als L3-agnostisch geen data heeft
 *   L2-globaal     — globale Welford per lithoClass (heel NL)
 *   L1-literatuur  — statische NL prior (huidig gedrag zonder meetdata)
 *
 * Feature flag: SOIL_KNOWLEDGE_ACTIVE=true activeert L2/L3.
 * Zonder flag: altijd L1 (identiek aan oud gedrag).
 *
 * Veilig als drop-in voor de empirical-prior.ts resolver.
 */

import { createClient } from '@supabase/supabase-js';
import {
  getLiteratureLevel,
  welfordToLevel,
  computeSafePosterior,
} from './bayesian-posterior';
import { NL_RHO_WET_PRIOR } from '@/lib/pipeline/rho-priors';
import { MIN_SOFT_N_GLOBAL, MIN_SOFT_N_REGIONAL } from './priors';
import type { WelfordState } from './types';

export type ActivePriorSource =
  | 'l3_regional_agnostic'  // class-agnostisch: werkt ondanks verkeerde BRO-klasse
  | 'l3_regional'           // per-klasse regionaal
  | 'l2_global'             // per-klasse globaal
  | 'l1_literature';        // statische literatuurprior

export interface ActivePriorResult {
  rhoWet:        number;
  source:        ActivePriorSource;
  posteriorMu?:  number;
  posteriorSigma?: number;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function snapToGrid(v: number, step = 5000): number {
  return Math.round(v / step) * step;
}

/**
 * Resolveert de actieve rhoWet voor een locatie en bodemklasse.
 *
 * @param lithoClass  BRO-lithoclass (1–5), null als onbekend
 * @param rhoFallback Bulk-ρ uit gebruikersinvoer (Ω·m)
 * @param rdX         RD-x coördinaat (EPSG:28992), null als niet beschikbaar
 * @param rdY         RD-y coördinaat
 */
export async function resolveActivePrior(
  lithoClass:  number | null | undefined,
  rhoFallback: number,
  rdX?:        number | null,
  rdY?:        number | null,
): Promise<ActivePriorResult> {
  // Feature flag — als uit: identiek aan oud gedrag
  if (process.env.SOIL_KNOWLEDGE_ACTIVE !== 'true') {
    const rhoWet = lithoClass != null
      ? ((NL_RHO_WET_PRIOR as Record<number, number | undefined>)[lithoClass] ?? Math.round(rhoFallback * 0.45))
      : Math.round(rhoFallback * 0.45);
    return { rhoWet, source: 'l1_literature' };
  }

  let supabase: ReturnType<typeof getServiceClient> | null = null;
  try {
    supabase = getServiceClient();
  } catch {
    // Geen service-role key (lokaal dev zonder env vars) → L1
    const rhoWet = lithoClass != null
      ? ((NL_RHO_WET_PRIOR as Record<number, number | undefined>)[lithoClass] ?? Math.round(rhoFallback * 0.45))
      : Math.round(rhoFallback * 0.45);
    return { rhoWet, source: 'l1_literature' };
  }

  // ── L3 class-agnostisch (werkt ook als BRO-klasse verkeerd is) ────────────
  if (rdX != null && rdY != null) {
    const gx = snapToGrid(rdX);
    const gy = snapToGrid(rdY);

    const { data: regionalAll } = await supabase
      .from('regional_prior')
      .select('litho_class, total_weight, welford_mean')
      .eq('rd_grid_x', gx)
      .eq('rd_grid_y', gy);

    if (regionalAll && regionalAll.length > 0) {
      const totalWeight = regionalAll.reduce((s, r) => s + (r.total_weight as number), 0);

      if (totalWeight >= MIN_SOFT_N_REGIONAL) {
        // Gewogen gemiddelde over ALLE klassen in deze rastercel.
        // Werkt onafhankelijk van de BRO-lithoClass — de meting bepaalt.
        const weightedRho = regionalAll.reduce(
          (s, r) => s + (r.total_weight as number) * (r.welford_mean as number),
          0,
        ) / totalWeight;

        if (Number.isFinite(weightedRho) && weightedRho > 0) {
          return {
            rhoWet: Math.round(weightedRho),
            source: 'l3_regional_agnostic',
          };
        }
      }
    }

    // ── L3 per-klasse (als agnostisch onvoldoende data, BRO-klasse wél correct) ─
    if (lithoClass != null) {
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
          const l1 = getLiteratureLevel(lithoClass);
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
  }

  // ── L2 globaal per-klasse ─────────────────────────────────────────────────
  if (lithoClass != null) {
    const { data: global } = await supabase
      .from('global_prior')
      .select('total_weight, welford_mean, welford_m2')
      .eq('litho_class', lithoClass)
      .maybeSingle();

    if (global) {
      const l2 = welfordToLevel(global as WelfordState, MIN_SOFT_N_GLOBAL);
      if (l2) {
        const l1 = getLiteratureLevel(lithoClass);
        const posterior = computeSafePosterior(l1, l2, null, null);
        return {
          rhoWet:        Math.round(posterior.mu),
          source:        'l2_global',
          posteriorMu:   posterior.mu,
          posteriorSigma: posterior.sigma,
        };
      }
    }
  }

  // ── L1 literatuurprior ────────────────────────────────────────────────────
  const l1Rho = lithoClass != null
    ? ((NL_RHO_WET_PRIOR as Record<number, number | undefined>)[lithoClass] ?? Math.round(rhoFallback * 0.45))
    : Math.round(rhoFallback * 0.45);
  return { rhoWet: l1Rho, source: 'l1_literature' };
}
