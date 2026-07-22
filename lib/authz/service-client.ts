/**
 * De ENIGE module in de hele codebase die de Supabase `service_role`-key mag
 * lezen en er een client mee mag construeren.
 *
 * Waarom dit een eigen bestand is (vereiste #8 uit de architectuuropdracht):
 * de audit trof `SUPABASE_SERVICE_ROLE_KEY` losstaand aan in twaalf
 * verschillende route-bestanden. Elke plek was een kans om per ongeluk een
 * RLS-omzeilende query te schrijven zonder de bijbehorende handmatige
 * ownership-check (en dat gebeurde ook, zij het niet fataal — zie
 * `app/api/debug-meting/route.ts`). Door deze key achter één geëxporteerde
 * functie te zetten, wordt "de service-role-client gebruiken buiten deze
 * module" een importgrens-schending die CI blokkeert
 * (scripts/architecture/check-service-role-isolation.ts), niet een
 * stijlkeuze die bij review gemist kan worden.
 *
 * Domeincode (lib/domain/**) roept deze functie aan wanneer een repository
 * bewust RLS moet omzeilen (bijv. omdat de aanroeper nog geen rij-eigenaar
 * is, zoals bij het claimen van een monteur-uitnodiging). De aanroeper is
 * zelf verantwoordelijk voor de ownership-check — deze module garandeert
 * alleen dát er precies één, auditeerbare plek is waar dat kan misgaan.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireSecret } from './config';

let cached: SupabaseClient | null = null;

/** RLS-omzeilende client. Nooit exporteren richting `app/api/**` of client-code. */
export function getServiceRoleClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      requireSecret('NEXT_PUBLIC_SUPABASE_URL'),
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );
  }
  return cached;
}
