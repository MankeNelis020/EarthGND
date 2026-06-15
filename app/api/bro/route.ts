import { NextRequest, NextResponse } from 'next/server';
import { lookupPostcode } from '@/lib/pdok';
import { fetchBroSoilData } from '@/lib/bro';
import { cacheGet, cacheSet } from '@/lib/redis';

const BRO_TTL = 60 * 60 * 24 * 30; // 30 days

export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get('postcode');
  const huisnummer = request.nextUrl.searchParams.get('huisnummer') ?? undefined;
  const rdXParam = request.nextUrl.searchParams.get('rdX');
  const rdYParam = request.nextUrl.searchParams.get('rdY');
  const latParam = request.nextUrl.searchParams.get('lat');
  const lonParam = request.nextUrl.searchParams.get('lon');

  try {
    let rdX: number;
    let rdY: number;
    let lat: number;
    let lon: number;
    let cacheKey: string;
    let addressData: { straatnaam?: string; huisnummer?: string; woonplaats?: string } = {};

    if (rdXParam && rdYParam && latParam && lonParam) {
      rdX = parseFloat(rdXParam);
      rdY = parseFloat(rdYParam);
      lat = parseFloat(latParam);
      lon = parseFloat(lonParam);
      cacheKey = `bro:rd:${Math.round(rdX)}:${Math.round(rdY)}`;
    } else if (postcode) {
      // Always fetch address from PDOK (fast, Next.js-cached 24 h) so
      // the confirmation shows even when BRO soil data is Redis-cached.
      const coords = await lookupPostcode(postcode, huisnummer);
      rdX = coords.rdX;
      rdY = coords.rdY;
      lat = coords.lat;
      lon = coords.lon;
      addressData = {
        straatnaam: coords.straatnaam,
        huisnummer: coords.huisnummer,
        woonplaats: coords.woonplaats,
      };
      const cleaned = postcode.replace(/\s/g, '').toUpperCase();
      cacheKey = huisnummer ? `bro:${cleaned}:${huisnummer}` : `bro:${cleaned}`;
    } else {
      return NextResponse.json({ error: 'postcode or rdX/rdY/lat/lon required' }, { status: 400 });
    }

    // Check Redis cache for the heavy BRO soil data, but always merge in fresh address
    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json({ ...cached, ...addressData });

    const broData = await fetchBroSoilData(rdX, rdY, lat, lon);
    const response = { ...broData, ...addressData };
    await cacheSet(cacheKey, response, BRO_TTL);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
