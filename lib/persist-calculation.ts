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

type InsertPayload = Record<string, unknown>;

const SCHEMA_COLUMNS = [
  'input_values',
  'result',
  'input',
  'resultaat',
  'risicoklasse',
] as const;

function schemaMissingColumn(message: string, column: string): boolean {
  const m = message.toLowerCase();
  return m.includes('schema cache') && m.includes(column.toLowerCase());
}

function extractMissingColumns(message: string): string[] {
  return SCHEMA_COLUMNS.filter(col => schemaMissingColumn(message, col));
}

function buildBase(row: CalculationPersistInput, includeRisicoklasse: boolean): InsertPayload {
  return {
    user_id:  row.user_id,
    tool:     row.tool,
    postcode: row.postcode ?? null,
    ...(includeRisicoklasse && row.risicoklasse != null ? { risicoklasse: row.risicoklasse } : {}),
    ...(row.pdf_url != null ? { pdf_url: row.pdf_url } : {}),
  };
}

function buildVariants(row: CalculationPersistInput, includeRisicoklasse: boolean) {
  const base = buildBase(row, includeRisicoklasse);
  const iv = row.input_values;
  const res = row.result;

  return [
    { name: 'canonical', payload: { ...base, input_values: iv, result: res }, legacy: false },
    {
      name: 'hybrid-input_values-resultaat',
      payload: { ...base, input_values: iv, resultaat: res },
      legacy: true,
    },
    {
      name: 'hybrid-input-result',
      payload: { ...base, input: iv, result: res },
      legacy: true,
    },
    {
      name: 'dual-write',
      payload: { ...base, input_values: iv, result: res, input: iv, resultaat: res },
      legacy: true,
    },
    { name: 'legacy', payload: { ...base, input: iv, resultaat: res }, legacy: true },
  ] as const;
}

async function tryInsert(
  supabase: SupabaseClient,
  payload: InsertPayload,
) {
  return supabase.from('calculations').insert(payload).select('id').single();
}

/**
 * Persist a calculation row across migration stages:
 * - canonical only (input_values + result)
 * - legacy only (input + resultaat)
 * - hybrid (mixed column names during partial migrations)
 * - dual-write (both sets populated)
 *
 * See docs/contracts.md §B and supabase/ensure_calculations_canonical.sql
 */
export async function persistCalculation(
  supabase: SupabaseClient,
  row: CalculationPersistInput,
): Promise<CalculationPersistResult> {
  const missing = new Set<string>();
  let lastSchemaError: string | undefined;
  let lastOtherError: string | undefined;

  for (const includeRisicoklasse of [true, false]) {
    for (const variant of buildVariants(row, includeRisicoklasse)) {
      const payloadKeys = Object.keys(variant.payload);
      if (payloadKeys.some(key => missing.has(key))) continue;

      const { data, error } = await tryInsert(supabase, variant.payload);
      if (data?.id) {
        if (variant.name !== 'canonical') {
          console.warn(`[calculations] persisted via ${variant.name}`);
        }
        return { id: data.id, usedLegacyColumns: variant.legacy };
      }

      if (!error) continue;

      console.error(`[calculations] ${variant.name} insert failed:`, error.message);

      for (const col of extractMissingColumns(error.message)) {
        missing.add(col);
      }

      const isSchemaError = extractMissingColumns(error.message).length > 0
        || error.message.toLowerCase().includes('schema cache');

      if (isSchemaError) {
        lastSchemaError = error.message;
      } else {
        lastOtherError = error.message;
      }
    }
  }

  return {
    id: null,
    usedLegacyColumns: false,
    error: lastOtherError ?? lastSchemaError ?? 'Berekening kon niet worden opgeslagen',
  };
}
