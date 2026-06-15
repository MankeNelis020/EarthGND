/**
 * GET /api/admin/pipeline-status
 *
 * Health-check for every soil-data source in the fetch chain.
 * Uses a single test location (Arnhem) with known good data.
 * Protected: requires a logged-in user whose email is in ADMIN_EMAILS env var
 * (or any authenticated user when ADMIN_EMAILS is unset).
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

// Arnhem: definite land, all sources should return data here
const TEST_LAT = 51.97;
const TEST_LON = 5.91;
const TEST_RD_X = 192000;
const TEST_RD_Y = 445000;

export type SourceStatus = 'ok' | 'down' | 'no_data' | 'timeout';

export interface SourceResult {
  status: SourceStatus;
  latencyMs: number;
  detail?: string;
}

async function checkCpt(): Promise<SourceResult> {
  const t0 = Date.now();
  try {
    const res = await fetch('https://publiek.broservices.nl/sr/cpt/v1/characteristics/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestReference: 'earthgnd-healthcheck',
        area: { enclosingCircle: { center: { lat: TEST_LAT, lon: TEST_LON }, radius: 2 } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { status: 'down', latencyMs, detail: `HTTP ${res.status}` };
    const text = await res.text();
    const hasIds = /<brocom:broId>/.test(text);
    return {
      status: hasIds ? 'ok' : 'no_data',
      latencyMs,
      detail: hasIds ? undefined : 'geen sonderingen binnen 2 km van testlocatie',
    };
  } catch (e) {
    return { status: 'timeout', latencyMs: Date.now() - t0, detail: String(e) };
  }
}

async function checkBhrGt(): Promise<SourceResult> {
  const t0 = Date.now();
  try {
    const res = await fetch('https://publiek.broservices.nl/sr/bhrgt/v2/characteristics/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestReference: 'earthgnd-healthcheck',
        area: { enclosingCircle: { center: { lat: TEST_LAT, lon: TEST_LON }, radius: 5 } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { status: 'down', latencyMs, detail: `HTTP ${res.status}` };
    const text = await res.text();
    const hasIds = /<brocom:broId>/.test(text);
    return {
      status: hasIds ? 'ok' : 'no_data',
      latencyMs,
      detail: hasIds ? undefined : 'geen boringen binnen 5 km van testlocatie',
    };
  } catch (e) {
    return { status: 'timeout', latencyMs: Date.now() - t0, detail: String(e) };
  }
}

async function checkGeoTop(): Promise<SourceResult> {
  const t0 = Date.now();
  try {
    const res = await fetch('https://publiek.broservices.nl/sr/geotop/v1/voxelmodels', {
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { status: 'down', latencyMs, detail: `HTTP ${res.status}` };
    return { status: 'ok', latencyMs };
  } catch (e) {
    return { status: 'timeout', latencyMs: Date.now() - t0, detail: String(e) };
  }
}

async function checkBodemkaart(): Promise<SourceResult> {
  const t0 = Date.now();
  try {
    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data, error } = await supabase
      .rpc('get_bodemkaart_at_point', { rd_x: TEST_RD_X, rd_y: TEST_RD_Y });
    const latencyMs = Date.now() - t0;
    if (error) return { status: 'down', latencyMs, detail: error.message };
    if (!data?.length) return { status: 'no_data', latencyMs, detail: 'RPC actief maar geen data op testlocatie' };
    return { status: 'ok', latencyMs, detail: `bodemcode: ${data[0].bodemcode}` };
  } catch (e) {
    return { status: 'timeout', latencyMs: Date.now() - t0, detail: String(e) };
  }
}

async function checkPdok(): Promise<SourceResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(
      'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?fq=type:postcode&q=6811AB&rows=1',
      { signal: AbortSignal.timeout(6000) },
    );
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { status: 'down', latencyMs, detail: `HTTP ${res.status}` };
    const data = await res.json();
    const hasResult = (data?.response?.numFound ?? 0) > 0;
    return {
      status: hasResult ? 'ok' : 'no_data',
      latencyMs,
      detail: hasResult ? undefined : 'geen resultaat voor testpostcode 6811AB',
    };
  } catch (e) {
    return { status: 'timeout', latencyMs: Date.now() - t0, detail: String(e) };
  }
}

async function checkGroundwater(): Promise<SourceResult> {
  const t0 = Date.now();
  const margin = 1500;
  const bbox = `${TEST_RD_X - margin},${TEST_RD_Y - margin},${TEST_RD_X + margin},${TEST_RD_Y + margin}`;
  const bboxCrs = 'http://www.opengis.net/def/crs/EPSG/0/28992';
  const base = 'https://api.pdok.nl/tno/bro-grondwatermonitoring-in-samenhang-karakteristieken/ogc/v1/collections';
  try {
    const [tubeRes, wellRes] = await Promise.all([
      fetch(`${base}/gm_gmw_monitoringtube/items?f=json&bbox=${bbox}&bbox-crs=${bboxCrs}&limit=10`,
        { signal: AbortSignal.timeout(7000) }),
      fetch(`${base}/gm_gmw/items?f=json&bbox=${bbox}&bbox-crs=${bboxCrs}&limit=10`,
        { signal: AbortSignal.timeout(7000) }),
    ]);
    const latencyMs = Date.now() - t0;
    if (!tubeRes.ok || !wellRes.ok) return { status: 'down', latencyMs, detail: `HTTP ${tubeRes.status}/${wellRes.status}` };
    const [tubeData, wellData] = await Promise.all([tubeRes.json(), wellRes.json()]);

    const pkToMaaiveld = new Map<number, number>();
    for (const f of wellData?.features ?? []) {
      const pk = f.properties?.gm_gmw_pk;
      const glp = f.properties?.ground_level_position;
      if (typeof pk === 'number' && typeof glp === 'number') pkToMaaiveld.set(pk, glp);
    }

    const depths: number[] = [];
    for (const f of tubeData?.features ?? []) {
      const maaiveld = pkToMaaiveld.get(f.properties?.gm_gmw_fk);
      const screenTop = f.properties?.screen_top_position;
      if (typeof maaiveld === 'number' && typeof screenTop === 'number') {
        const d = maaiveld - screenTop;
        if (d > 0 && d < 10) depths.push(d);
      }
    }

    if (!depths.length) return { status: 'no_data', latencyMs, detail: 'NAP-correctie lukt niet: geen overeenkomende peilbuizen' };
    depths.sort((a, b) => a - b);
    return { status: 'ok', latencyMs, detail: `GHG ≈ ${depths[0].toFixed(2)} m (NAP-gecorrigeerd, ${depths.length} peilbuizen)` };
  } catch (e) {
    return { status: 'timeout', latencyMs: Date.now() - t0, detail: String(e) };
  }
}

function estimateCoverage(sources: Record<string, SourceResult>): string {
  if (sources.geotop.status === 'ok') return '~97%';
  if (sources.bhrgt.status === 'ok' && sources.bodemkaart.status === 'ok') return '~90–93%';
  if (sources.bhrgt.status === 'ok') return '~65–75%';
  if (sources.bodemkaart.status === 'ok') return '~82–85%';
  if (sources.cpt.status === 'ok') return '~15–25%';
  return '<15% (alleen handmatig)';
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Geen toegang — voeg je e-mail toe aan ADMIN_EMAILS' }, { status: 403 });
  }

  const [cpt, bhrgt, geotop, bodemkaart, pdok, grondwater] = await Promise.all([
    checkCpt(),
    checkBhrGt(),
    checkGeoTop(),
    checkBodemkaart(),
    checkPdok(),
    checkGroundwater(),
  ]);

  const sources = { cpt, bhrgt, geotop, bodemkaart, pdok, grondwater };
  const okCount = Object.values(sources).filter((s) => s.status === 'ok').length;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    testLocation: { lat: TEST_LAT, lon: TEST_LON, rdX: TEST_RD_X, rdY: TEST_RD_Y, label: 'Arnhem' },
    sources,
    coverageEstimate: estimateCoverage(sources),
    okCount,
    totalCount: Object.keys(sources).length,
  });
}
