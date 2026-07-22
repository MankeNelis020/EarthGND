/**
 * Ownership-safe toegang tot de `calculations`-tabel (vereiste #4). Er
 * bestaat met opzet geen "getById(id)" — elke lookup vereist een
 * `ownerId`, zodat een use-case niet per ongeluk een rij van iemand anders
 * kan laden. Dit is de server-side resource-lookup die
 * `AuthorizedContext.authorize()` als `resolvedOwnerId` krijgt aangeleverd —
 * nooit een ID dat de client als "van mij" claimt.
 *
 * Kolomnamen volgen docs/contracts.md §B (canoniek `input_values`/`result`).
 * Voor legacy rijen zonder die kolommen bestaat lib/scan-context.ts al —
 * die blijft de plek voor het lezen van oude rijen in de UI; deze
 * repository bediant alleen de nieuwe secure-endpoint-paden.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StoredCalculation {
  id: string;
  user_id: string;
  tool: 'ohm' | 'diepte';
  postcode: string | null;
  input_values: Record<string, unknown>;
  result: Record<string, unknown>;
  risicoklasse: string | null;
}

/** Server-side vastgestelde eigenaar van een calculation-rij, of null als hij niet bestaat. Voor gebruik als `resourceOwner` in defineEndpoint. */
export async function findCalculationOwnerId(
  supabase: Pick<SupabaseClient, 'from'>,
  calculationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('calculations')
    .select('user_id')
    .eq('id', calculationId)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * Haalt de rij pas op nadat ownership al is bevestigd door de authz-kernel —
 * de `.eq('user_id', ownerId)` hier is verdediging in de diepte, niet de
 * enige controle (RLS op `calculations` dwingt hetzelfde al af).
 */
export async function getOwnedCalculation(
  supabase: Pick<SupabaseClient, 'from'>,
  calculationId: string,
  ownerId: string,
): Promise<StoredCalculation | null> {
  const { data } = await supabase
    .from('calculations')
    .select('id, user_id, tool, postcode, input_values, result, risicoklasse')
    .eq('id', calculationId)
    .eq('user_id', ownerId)
    .maybeSingle();
  return (data as StoredCalculation | null) ?? null;
}
