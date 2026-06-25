import { NextRequest, NextResponse } from 'next/server';
import { lookupPostcode } from '@/lib/pdok';
import { fetchBroSoilData } from '@/lib/bro';
import { cacheGet, cacheSet, checkRateLimit } from '@/lib/redis';

const BRO_TTL = 60 * 60 * 24 * 30; // 30 days

// 30 unique-postcode lookups per minute per IP.
// Redis-cached responses are served before this check runs, so
// repeat lookups of the same postcode don't count against the limit.
const RATE_LIMIT = 30;
const RATE_WINDOW_S = 60;

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

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
      cacheKey = `bro:v4:rd:${Math.round(rdX)}:${Math.round(rdY)}`;
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
      // v4: cache key bumped for CPT radius change 0.5→0.25 km (2026-06-25)
      cacheKey = huisnummer ? `bro:v4:${cleaned}:${huisnummer}` : `bro:v4:${cleaned}`;
    } else {
      return NextResponse.json({ error: 'postcode or rdX/rdY/lat/lon required' }, { status: 400 });
    }

    // Serve cached response before rate-limit check so repeat lookups are free.
    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json({ ...cached, ...addressData });

    // Rate limit uncached requests (each triggers 5 outbound BRO API calls).
    const ip = getIp(request);
    const allowed = await checkRateLimit(`rl:bro:${ip}`, RATE_LIMIT, RATE_WINDOW_S);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Te veel verzoeken — wacht even en probeer opnieuw.' },
        { status: 429 },
      );
    }

    const broData = await fetchBroSoilData(rdX, rdY, lat, lon);
    const response = { ...broData, ...addressData };
    await cacheSet(cacheKey, response, BRO_TTL);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
