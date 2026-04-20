import { NextRequest, NextResponse } from 'next/server';
import { lookupPostcode } from '@/lib/pdok';
import { fetchBroSoilData } from '@/lib/bro';
import { cacheGet, cacheSet } from '@/lib/redis';

const BRO_TTL = 60 * 60 * 24 * 30; // 30 days

export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get('postcode');
  if (!postcode) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 });
  }

  const cacheKey = `bro:${postcode.replace(/\s/g, '').toUpperCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const coords = await lookupPostcode(postcode);
    const broData = await fetchBroSoilData(coords.rdX, coords.rdY);
    await cacheSet(cacheKey, broData, BRO_TTL);
    return NextResponse.json(broData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
