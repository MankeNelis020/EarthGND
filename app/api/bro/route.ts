import { NextRequest, NextResponse } from 'next/server';
import { lookupPostcode } from '@/lib/pdok';
import { fetchBroSoilData } from '@/lib/bro';
import { cacheGet, cacheSet } from '@/lib/redis';

const BRO_TTL = 60 * 60 * 24 * 30;

export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get('postcode');
  const rdXParam = request.nextUrl.searchParams.get('rdX');
  const rdYParam = request.nextUrl.searchParams.get('rdY');
  const mode = request.nextUrl.searchParams.get('mode') === 'free' ? 'free' : 'pro';

  if (!postcode && (!rdXParam || !rdYParam)) {
    return NextResponse.json({ error: 'postcode or rdX/rdY required' }, { status: 400 });
  }

  const cacheKey = postcode
    ? `bro:${postcode.replace(/\s/g, '').toUpperCase()}:${mode}`
    : `bro:xy:${rdXParam}:${rdYParam}:${mode}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    let rdX = Number(rdXParam);
    let rdY = Number(rdYParam);

    if (postcode && (!rdXParam || !rdYParam)) {
      const coords = await lookupPostcode(postcode);
      rdX = coords.rdX;
      rdY = coords.rdY;
    }

    const broData = await fetchBroSoilData(rdX, rdY, mode);
    await cacheSet(cacheKey, broData, BRO_TTL);
    return NextResponse.json(broData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
