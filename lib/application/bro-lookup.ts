/**
 * Use-case voor capability 'bro:lookup'. Bevat de ongewijzigde domeinlogica
 * uit het oude `app/api/bro/route.ts` (postcode/rdX-lookup, Redis-cache) —
 * alleen de toegangscontrole eromheen is verhuisd naar de authz-kernel.
 * Geen HTTP hier: dit geeft platte data terug, niet een Response — dat
 * blijft de taak van het route-bestand (de edge-laag).
 */

import { z } from 'zod';
import { lookupPostcode } from '@/lib/pdok';
import { fetchBroSoilData } from '@/lib/bro';
import { cacheGet, cacheSet } from '@/lib/redis';
import type { AuthorizedContext } from '@/lib/authz/context';

const BRO_TTL = 60 * 60 * 24 * 30; // 30 dagen — ongewijzigd t.o.v. de oude route

export const BroLookupInput = z
  .object({
    postcode: z.string().trim().min(1).optional(),
    huisnummer: z.string().trim().min(1).optional(),
    rdX: z.string().optional(),
    rdY: z.string().optional(),
    lat: z.string().optional(),
    lon: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.postcode) || Boolean(v.rdX && v.rdY && v.lat && v.lon),
    { message: 'postcode of rdX/rdY/lat/lon is vereist' },
  );

export type BroLookupInput = z.infer<typeof BroLookupInput>;

export interface BroLookupResult {
  [key: string]: unknown;
  straatnaam?: string;
  huisnummer?: string;
  woonplaats?: string;
}

export async function lookupSoilData(
  _ctx: AuthorizedContext<'bro:lookup'>,
  input: BroLookupInput,
): Promise<BroLookupResult> {
  let rdX: number;
  let rdY: number;
  let lat: number;
  let lon: number;
  let cacheKey: string;
  let addressData: Pick<BroLookupResult, 'straatnaam' | 'huisnummer' | 'woonplaats'> = {};

  if (input.rdX && input.rdY && input.lat && input.lon) {
    rdX = parseFloat(input.rdX);
    rdY = parseFloat(input.rdY);
    lat = parseFloat(input.lat);
    lon = parseFloat(input.lon);
    cacheKey = `bro:v4:rd:${Math.round(rdX)}:${Math.round(rdY)}`;
  } else {
    const coords = await lookupPostcode(input.postcode!, input.huisnummer);
    rdX = coords.rdX;
    rdY = coords.rdY;
    lat = coords.lat;
    lon = coords.lon;
    addressData = {
      straatnaam: coords.straatnaam,
      huisnummer: coords.huisnummer,
      woonplaats: coords.woonplaats,
    };
    const cleaned = input.postcode!.replace(/\s/g, '').toUpperCase();
    cacheKey = input.huisnummer ? `bro:v4:${cleaned}:${input.huisnummer}` : `bro:v4:${cleaned}`;
  }

  const cached = await cacheGet<BroLookupResult>(cacheKey);
  if (cached) return { ...cached, ...addressData };

  const broData = await fetchBroSoilData(rdX, rdY, lat, lon);
  const response = { ...broData, ...addressData };
  await cacheSet(cacheKey, response, BRO_TTL);
  return response;
}
