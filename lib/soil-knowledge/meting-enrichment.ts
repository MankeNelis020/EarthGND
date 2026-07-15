/**
 * Verrijk pendiepte_meting met BRO-snapshot uit gekoppelde berekening
 * vóór processMeting (grondwater + lithoClass voor reverse-engine).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveRhoWet } from '@/lib/pipeline/rho-priors';

export async function enrichMetingFromCalculation(
  calculationId: string,
  metingId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: calc } = await supabase
    .from('calculations')
    .select('input_values')
    .eq('id', calculationId)
    .maybeSingle();

  if (!calc?.input_values || typeof calc.input_values !== 'object') return;

  const iv = calc.input_values as Record<string, unknown>;
  const lithoClass = typeof iv.lithoClass === 'number' ? iv.lithoClass : null;
  const gwDepth = typeof iv.groundwaterDepth === 'number' ? iv.groundwaterDepth : null;
  const rho = typeof iv.rho === 'number' ? iv.rho : 125;

  const { data: meting } = await supabase
    .from('pendiepte_metingen')
    .select('bro_litho_class, bro_gw_depth, field_gw_depth')
    .eq('id', metingId)
    .single();

  if (!meting) return;

  const patch: Record<string, number> = {};
  if (meting.bro_litho_class == null && lithoClass != null) patch.bro_litho_class = lithoClass;
  if (meting.bro_gw_depth == null && gwDepth != null) patch.bro_gw_depth = gwDepth;
  if (meting.field_gw_depth == null && gwDepth != null) patch.field_gw_depth = gwDepth;

  if (Object.keys(patch).length === 0) return;

  // bro_rho_wet is afgeleid — alleen zetten als lithoClass bekend
  const updates: Record<string, unknown> = { ...patch };
  if (lithoClass != null) {
    updates.bro_rho_wet = resolveRhoWet(lithoClass, rho);
  }

  await supabase.from('pendiepte_metingen').update(updates).eq('id', metingId);
}
