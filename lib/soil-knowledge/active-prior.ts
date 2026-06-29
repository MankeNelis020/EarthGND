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
import { resolveLocalKnowledge, type LocalDepthHint } from './local-prior';
import { isSoilKnowledgeActive } from './sheet-sync';
import type { WelfordState } from './types';

export type ActivePriorSource =
  | 'l4_local'              // IDW nabije veldmetingen (≤500 m)
  | 'l3_regional_agnostic'  // class-agnostisch: werkt ondanks verkeerde BRO-klasse
  | 'l3_regional'           // per-klasse regionaal
  | 'l2_global'             // per-klasse globaal
  | 'l1_literature';        // statische literatuurprior

export interface ActivePriorResult {
  rhoWet:        number;
  source:        ActivePriorSource;
  posteriorMu?:  number;
  posteriorSigma?: number;
  localDepthHint?: LocalDepthHint | null;
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
 * @param lat         WGS84 (voor L4), null als niet beschikbaar
 * @param lon         WGS84
 * @param postcode    Voor exact-adres match in L4
 * @param huisnummer  Voor exact-adres match in L4
 */
export async function resolveActivePrior(
  lithoClass:  number | null | undefined,
  rhoFallback: number,
  rdX?:        number | null,
  rdY?:        number | null,
  lat?:        number | null,
  lon?:        number | null,
  postcode?:   string | null,
  huisnummer?: string | null,
): Promise<ActivePriorResult> {
  const l1Rho = lithoClass != null
    ? ((NL_RHO_WET_PRIOR as Record<number, number | undefined>)[lithoClass] ?? Math.round(rhoFallback * 0.45))
    : Math.round(rhoFallback * 0.45);

  // Feature flag — als uit: L1 + optioneel lokale diepte-hint (informatief)
  if (!isSoilKnowledgeActive()) {
    let localDepthHint: LocalDepthHint | null = null;
    if (lat != null && lon != null) {
      try {
        const local = await resolveLocalKnowledge(lat, lon, postcode, huisnummer);
        localDepthHint = local.depthHint;
      } catch { /* non-critical */ }
    }
    return { rhoWet: l1Rho, source: 'l1_literature', localDepthHint };
  }

  let supabase: ReturnType<typeof getServiceClient> | null = null;
  try {
    supabase = getServiceClient();
  } catch {
    return { rhoWet: l1Rho, source: 'l1_literature' };
  }

  let localDepthHint: LocalDepthHint | null = null;

  // ── L4 lokaal (IDW veldmetingen ≤500 m) ───────────────────────────────────
  if (lat != null && lon != null) {
    try {
      const local = await resolveLocalKnowledge(lat, lon, postcode, huisnummer, supabase);
      localDepthHint = local.depthHint;

      if (local.l4 && lithoClass != null) {
        const l1 = getLiteratureLevel(lithoClass);
        const posterior = computeSafePosterior(l1, null, null, local.l4);
        return {
          rhoWet:         Math.round(posterior.mu),
          source:         'l4_local',
          posteriorMu:    posterior.mu,
          posteriorSigma: posterior.sigma,
          localDepthHint,
        };
      }
    } catch (e) {
      console.warn('[active-prior/L4]', e);
    }
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
            localDepthHint,
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
            localDepthHint,
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
          localDepthHint,
        };
      }
    }
  }

  // ── L1 literatuurprior ────────────────────────────────────────────────────
  return { rhoWet: l1Rho, source: 'l1_literature', localDepthHint };
}
