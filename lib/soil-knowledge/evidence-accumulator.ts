/**
 * Evidence accumulatie: van confirmed meting naar Layer 2/3 kennisbank.
 *
 * Proces per meting:
 *   1. Laad meting uit pendiepte_metingen
 *   2. analyzeDepthCurve → ρ_apparent + P(k) per dieptepunt
 *   3. Sla op in soil_evidence (Layer 2 observaties)
 *   4. Accumuleer natte punten via Welford naar global_prior (L2)
 *   5. Accumuleer natte punten via Welford naar regional_prior (L3)
 *
 * Grind (lithoClass=4): bewijs WEL opgeslagen, NIET geaccumuleerd (learning_blocked).
 * Droge punten (boven GWT): opgeslagen in soil_evidence, nog niet geaccumuleerd
 *   (toekomstige uitbreiding: rhoDry kennisbank).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { analyzeDepthCurve } from './reverse-engine';
import { isLearningBlocked } from './bayesian-posterior';
import { LITERATURE_PRIOR } from './priors';
import { NL_RHO_WET_PRIOR } from '@/lib/pipeline/rho-priors';
import type { SoilEvidenceRow, WelfordState } from './types';

// ─── Supabase client (service role — bypasses RLS) ───────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE env vars niet geconfigureerd');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Welford gewogen online update ───────────────────────────────────────────

/**
 * Welford gewogen online variantie-update.
 * Berekent nieuwe (total_weight, mean, M2) na toevoeging van gewicht w op waarde v.
 * Referentie: West (1979), D.H.D. West, weighted online algorithm.
 */
function welfordUpdate(state: WelfordState, weight: number, value: number): WelfordState {
  const newTotalWeight = state.total_weight + weight;
  const oldMean = state.welford_mean;
  const newMean = oldMean + (weight / newTotalWeight) * (value - oldMean);
  const newM2 = state.welford_m2 + weight * (value - oldMean) * (value - newMean);
  return {
    total_weight: newTotalWeight,
    welford_mean: newMean,
    welford_m2: newM2,
  };
}

// ─── Database helpers ─────────────────────────────────────────────────────────

async function fetchWelford(
  supabase: SupabaseClient,
  table: string,
  filter: Record<string, number>,
): Promise<WelfordState> {
  let q = supabase
    .from(table)
    .select('total_weight, welford_mean, welford_m2');

  for (const [col, val] of Object.entries(filter)) {
    q = q.eq(col, val);
  }

  const { data } = await q.maybeSingle();
  return (data as WelfordState | null) ?? { total_weight: 0, welford_mean: 0, welford_m2: 0 };
}

function computePosteriorSigma(state: WelfordState): number | null {
  if (state.total_weight <= 1) return null;
  const sigma = Math.sqrt(state.welford_m2 / state.total_weight);
  return isFinite(sigma) && sigma > 0 ? sigma : null;
}

// ─── Hoofd-functie ────────────────────────────────────────────────────────────

/**
 * Verwerkt een confirmed pendiepte_meting volledig:
 *   - Derives soil evidence (Layer 2)
 *   - Accumulates into global_prior (L2 Welford)
 *   - Accumulates into regional_prior (L3 Welford, alleen als lat/lon aanwezig)
 *
 * Idempotent: soil_evidence rijen worden vervangen op conflict (meting_id, depth_m).
 * Welford-accumulatie is NIET idempotent — aanroepen per meting slechts één keer.
 * Gebruik processingLock of check soil_evidence.count > 0 voor idempotentie.
 *
 * @param metingId UUID van pendiepte_metingen
 * @param supabaseClient optioneel — anders wordt service-role client aangemaakt
 */
export async function processMeting(
  metingId: string,
  supabaseClient?: SupabaseClient,
): Promise<{ pointsProcessed: number; evidenceInserted: number }> {
  const supabase: SupabaseClient = supabaseClient ?? getServiceClient();

  // ── 1. Laad meting ──────────────────────────────────────────────────────
  const { data: meting, error } = await supabase
    .from('pendiepte_metingen')
    .select('*')
    .eq('id', metingId)
    .single();

  if (error || !meting) throw new Error(`Meting ${metingId} niet gevonden: ${error?.message}`);
  if (meting.status !== 'confirmed') throw new Error(`Meting ${metingId} is niet confirmed`);
  if (meting.measurement_quality === 'onbruikbaar') {
    return { pointsProcessed: 0, evidenceInserted: 0 };
  }

  const depthCurve: Array<{ depth: number; ra: number }> = meting.depth_curve ?? [];
  if (!depthCurve.length) return { pointsProcessed: 0, evidenceInserted: 0 };

  // ── 2. Grondwaterdiepte (veldwaarneming heeft prioriteit) ───────────────
  const gwDepth: number = meting.field_gw_depth ?? meting.bro_gw_depth ?? 2.0;

  // ── 3. Analyseer dieptecurve ────────────────────────────────────────────
  const analyzed = analyzeDepthCurve(depthCurve, gwDepth);
  if (!analyzed.length) return { pointsProcessed: 0, evidenceInserted: 0 };

  const broLithoClass: number | null = meting.bro_litho_class ?? null;

  // BRO rhoWet voor consistentiecheck (huidige actieve prior)
  const broRhoWet: number | null = broLithoClass != null
    ? ((NL_RHO_WET_PRIOR as Record<number, number | undefined>)[broLithoClass] ?? null)
    : null;

  // ── 4. Bouw soil_evidence rijen ─────────────────────────────────────────
  const evidenceRows: SoilEvidenceRow[] = analyzed.map(pt => {
    const consistencyRatio = broRhoWet != null && pt.rhoApparent > 0
      ? pt.rhoApparent / broRhoWet
      : null;

    return {
      meting_id: metingId,
      depth_m: pt.depthM,
      rho_apparent: Math.round(pt.rhoApparent * 10) / 10, // 1 decimaal
      zone: pt.zone,
      derivation_method: 'dwight_no_minus1',
      p_klei:  Math.round((pt.classDist[1] ?? 0) * 10000) / 10000,
      p_leem:  Math.round((pt.classDist[2] ?? 0) * 10000) / 10000,
      p_zand:  Math.round((pt.classDist[3] ?? 0) * 10000) / 10000,
      p_grind: Math.round((pt.classDist[4] ?? 0) * 10000) / 10000,
      p_veen:  Math.round((pt.classDist[5] ?? 0) * 10000) / 10000,
      bro_litho_class: broLithoClass,
      bro_rho_wet: broRhoWet,
      consistency_ratio: consistencyRatio != null
        ? Math.round(consistencyRatio * 1000) / 1000
        : null,
      flagged_inconsistent: consistencyRatio != null
        && (consistencyRatio > 3.0 || consistencyRatio < 0.30),
    };
  });

  // Check BEFORE upsert — if rows already exist, Welford was already accumulated.
  // Upsert is idempotent for soil_evidence, but Welford accumulation is NOT.
  const { count: existingCount } = await supabase
    .from('soil_evidence')
    .select('*', { count: 'exact', head: true })
    .eq('meting_id', metingId);
  const alreadyAccumulated = (existingCount ?? 0) > 0;

  const { error: evidenceError } = await supabase
    .from('soil_evidence')
    .upsert(evidenceRows, { onConflict: 'meting_id,depth_m' });

  if (evidenceError) throw new Error(`soil_evidence insert fout: ${evidenceError.message}`);

  // ── 5. Accumuleer natte punten naar L2/L3 ───────────────────────────────
  // Alleen natte punten (onder GWT) voor rhoWet kennisbank.
  // Guard: als soil_evidence al bestond, is Welford al eerder verwerkt — sla over.
  if (alreadyAccumulated) {
    return { pointsProcessed: analyzed.length, evidenceInserted: evidenceRows.length };
  }
  const wetPoints = analyzed.filter(pt => pt.zone === 'wet');

  for (const pt of wetPoints) {
    const rho = pt.rhoApparent;
    if (!isFinite(rho) || rho <= 0) continue;

    for (const [kStr, prob] of Object.entries(pt.classDist)) {
      const k = parseInt(kStr);
      if (!prob || prob < 0.01) continue; // verwaarloosbare bijdrage overslaan
      if (isLearningBlocked(k)) continue; // grind: bewijs opgeslagen, niet geaccumuleerd

      const weight = prob;

      // L2: global_prior
      const currentGlobal = await fetchWelford(supabase, 'global_prior', { litho_class: k });
      const updatedGlobal = welfordUpdate(currentGlobal, weight, rho);

      const litPrior = LITERATURE_PRIOR[k] ?? LITERATURE_PRIOR[3];
      const { error: globalError } = await supabase.from('global_prior').upsert({
        litho_class:          k,
        literature_mu:        litPrior.mu,
        literature_sigma:     litPrior.sigma,
        literature_n_virtual: litPrior.nVirtual,
        total_weight:         updatedGlobal.total_weight,
        welford_mean:         updatedGlobal.welford_mean,
        welford_m2:           updatedGlobal.welford_m2,
        posterior_mu:         updatedGlobal.welford_mean,
        posterior_sigma:      computePosteriorSigma(updatedGlobal),
        last_updated:         new Date().toISOString(),
      }, { onConflict: 'litho_class' });

      if (globalError) throw new Error(`global_prior upsert fout (litho_class=${k}): ${globalError.message}`);

      // L3: regional_prior (alleen als RD-coördinaten beschikbaar)
      if (meting.rd_x != null && meting.rd_y != null) {
        const gridX = Math.round(meting.rd_x / 5000) * 5000;
        const gridY = Math.round(meting.rd_y / 5000) * 5000;

        const currentRegional = await fetchWelford(
          supabase, 'regional_prior',
          { rd_grid_x: gridX, rd_grid_y: gridY, litho_class: k },
        );
        const updatedRegional = welfordUpdate(currentRegional, weight, rho);

        await supabase.from('regional_prior').upsert({
          rd_grid_x: gridX,
          rd_grid_y: gridY,
          litho_class: k,
          total_weight: updatedRegional.total_weight,
          welford_mean: updatedRegional.welford_mean,
          welford_m2:   updatedRegional.welford_m2,
          posterior_mu:    updatedRegional.welford_mean,
          posterior_sigma: computePosteriorSigma(updatedRegional),
          last_updated: new Date().toISOString(),
        }, { onConflict: 'rd_grid_x,rd_grid_y,litho_class' });
      }
    }
  }

  return {
    pointsProcessed: analyzed.length,
    evidenceInserted: evidenceRows.length,
  };
}
