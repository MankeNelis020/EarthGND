import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const rdX = Number(request.nextUrl.searchParams.get('rdX'));
  const rdY = Number(request.nextUrl.searchParams.get('rdY'));

  if (!Number.isFinite(rdX) || !Number.isFinite(rdY)) {
    return NextResponse.json({ error: 'rdX and rdY required' }, { status: 400 });
  }

  const margin = 1000;
  const bbox = `${rdX - margin},${rdY - margin},${rdX + margin},${rdY + margin}`;
  const url = `https://api.pdok.nl/tno/bro-grondwatermonitoring-in-samenhang-karakteristieken/ogc/v1/collections/gm_gmw_monitoringtube/items?f=json&bbox=${bbox}&bbox-crs=http://www.opengis.net/def/crs/EPSG/0/28992&limit=10`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`PDOK groundwater request failed: ${res.status}`);

    const data = await res.json();
    const features: Array<{ properties?: Record<string, unknown> }> = data?.features ?? [];

    // screen_top_position is negative metres below surface → abs = GW depth proxy
    const depths = features
      .map((f) => f.properties?.screen_top_position)
      .filter((v): v is number => typeof v === 'number' && isFinite(v) && v < 0)
      .map((v) => Math.abs(v));

    if (!depths.length) {
      return NextResponse.json({
        ghgDepthMeters: null,
        source: 'pdok-gm',
        warning: 'Geen grondwatergegevens gevonden in de buurt',
      });
    }

    depths.sort((a, b) => a - b);
    const median = depths[Math.floor(depths.length / 2)];

    return NextResponse.json({ ghgDepthMeters: median, source: 'pdok-gm' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
