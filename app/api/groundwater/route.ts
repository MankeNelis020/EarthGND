import { NextRequest, NextResponse } from 'next/server';

function extractNumericFromObject(obj: Record<string, unknown>): number | null {
  const preferredKeys = ['ghg', 'gemiddeldHoogsteGrondwaterstand', 'meanHighestGroundwaterLevel'];
  for (const key of preferredKeys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const lowered = key.toLowerCase();
    if (lowered.includes('ghg') || (lowered.includes('hoog') && lowered.includes('grondwater'))) {
      return value;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const rdX = Number(request.nextUrl.searchParams.get('rdX'));
  const rdY = Number(request.nextUrl.searchParams.get('rdY'));

  if (!Number.isFinite(rdX) || !Number.isFinite(rdY)) {
    return NextResponse.json({ error: 'rdX and rdY required' }, { status: 400 });
  }

  const bbox = `${rdX - 1000},${rdY - 1000},${rdX + 1000},${rdY + 1000}`;
  const url = `https://api.pdok.nl/tno/bro-grondwatermonitoring-in-samenhang-karakteristieken/ogc/v1/collections/gm_gmw_monitoringtube/items?f=json&bbox=${bbox}&bbox-crs=http://www.opengis.net/def/crs/EPSG/0/28992&limit=50`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`PDOK groundwater request failed: ${res.status}`);

    const data = await res.json();
    const features: Array<{ properties?: Record<string, unknown> }> = data?.features ?? [];

    for (const feature of features) {
      const props = feature.properties ?? {};
      const ghg = extractNumericFromObject(props);
      if (ghg !== null) {
        return NextResponse.json({ ghgDepthMeters: Math.abs(Number(ghg)), source: 'pdok-gm' });
      }
    }

    return NextResponse.json({ ghgDepthMeters: null, source: 'pdok-gm', warning: 'Geen GHG in PDOK response gevonden' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
