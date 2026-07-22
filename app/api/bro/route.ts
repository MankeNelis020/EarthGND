/**
 * Migratie van bevinding B1 (auditrapport): deze route had geen enkele
 * auth-check en gaf de volledige BRO/GeoTOP-bodemdata per adres gratis en
 * ongeauthenticeerd terug — precies het betaalde onderscheid van de
 * Diepte-calculator. Nu verplicht via defineEndpoint + capability
 * 'bro:lookup' (lib/authz/capability.ts): vereist een ingelogde gebruiker
 * met een actief plan of credits (dezelfde regel als de paginagate),
 * schrijft geen credit af (zie docs/architecture/bro-charging-boundary.md).
 *
 * Dit bestand bevat met opzet geen businesslogica en geen databasetoegang —
 * dat staat in lib/application/bro-lookup.ts.
 */

import { defineEndpoint } from '@/lib/edge/define-endpoint';
import { BroLookupInput, lookupSoilData } from '@/lib/application/bro-lookup';

export const runtime = 'nodejs';

export const GET = defineEndpoint({
  capability: 'bro:lookup',
  source: 'query',
  input: BroLookupInput,
  handler: async (ctx, input) => {
    try {
      const result = await lookupSoilData(ctx, input);
      return Response.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return Response.json({ error: message }, { status: 500 });
    }
  },
});
