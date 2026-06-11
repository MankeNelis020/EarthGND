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

  try {
    let rdX: number;
    let rdY: number;
    let cacheKey: string;

    if (rdXParam && rdYParam) {
      rdX = parseFloat(rdXParam);
      rdY = parseFloat(rdYParam);
      cacheKey = `bro:rd:${Math.round(rdX)}:${Math.round(rdY)}`;
    } else if (postcode) {
      const cleaned = postcode.replace(/\s/g, '').toUpperCase();
      cacheKey = huisnummer ? `bro:${cleaned}:${huisnummer}` : `bro:${cleaned}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return NextResponse.json(cached);
      const coords = await lookupPostcode(postcode, huisnummer);
      rdX = coords.rdX;
      rdY = coords.rdY;
    } else {
      return NextResponse.json({ error: 'postcode or rdX/rdY required' }, { status: 400 });
    }

    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    const broData = await fetchBroSoilData(rdX, rdY);
    await cacheSet(cacheKey, broData, BRO_TTL);
    return NextResponse.json(broData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
