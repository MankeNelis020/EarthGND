import type { SupabaseClient } from '@supabase/supabase-js';

export type CalculationTool = 'ohm' | 'diepte';

export interface CalculationPersistInput {
  user_id: string;
  tool: CalculationTool;
  postcode?: string | null;
  risicoklasse?: string | null;
  input_values: Record<string, unknown>;
  result: Record<string, unknown>;
  pdf_url?: string | null;
}

export interface CalculationPersistResult {
  id: string | null;
  usedLegacyColumns: boolean;
  error?: string;
}

/**
 * Persist a calculation row, tolerating both canonical (input_values/result)
 * and legacy (input/resultaat) column names — see docs/contracts.md §B.
 */
export async function persistCalculation(
  supabase: SupabaseClient,
  row: CalculationPersistInput,
): Promise<CalculationPersistResult> {
  const canonical = {
    user_id:      row.user_id,
    tool:         row.tool,
    postcode:     row.postcode ?? null,
    risicoklasse: row.risicoklasse ?? null,
    input_values: row.input_values,
    result:       row.result,
    ...(row.pdf_url != null ? { pdf_url: row.pdf_url } : {}),
  };

  const { data, error } = await supabase
    .from('calculations')
    .insert(canonical)
    .select('id')
    .single();

  if (data?.id) {
    return { id: data.id, usedLegacyColumns: false };
  }

  if (!error) {
    return { id: null, usedLegacyColumns: false, error: 'Insert returned no row' };
  }

  console.error('[calculations] canonical insert failed:', error.message);

  const legacy = {
    user_id:      row.user_id,
    tool:         row.tool,
    postcode:     row.postcode ?? null,
    risicoklasse: row.risicoklasse ?? null,
    input:        row.input_values,
    resultaat:    row.result,
    ...(row.pdf_url != null ? { pdf_url: row.pdf_url } : {}),
  };

  const { data: legacyRow, error: legacyError } = await supabase
    .from('calculations')
    .insert(legacy)
    .select('id')
    .single();

  if (legacyRow?.id) {
    console.warn('[calculations] persisted via legacy columns — run rename_calculations_columns.sql');
    return { id: legacyRow.id, usedLegacyColumns: true };
  }

  const message = legacyError?.message ?? error.message;
  console.error('[calculations] legacy insert failed:', message);
  return { id: null, usedLegacyColumns: false, error: message };
}
