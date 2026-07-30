/**
 * GET /api/admin/moat/sales?q=Prinsengracht+200+Amsterdam&radius=2000
 * Sales battlefield: geocode → nearby outcomes → region moat summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { forwardGeocode } from '@/lib/geocoding';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { moatRegionForCoords } from '@/lib/moat/regions';
import {
  SALES_NEARBY_RADIUS_M,
  fetchSalesNearbyOutcomes,
  lookupRegionSummary,
  summarizeNearbyForPitch,
} from '@/lib/moat/sales-nearby';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const radiusRaw = request.nextUrl.searchParams.get('radius');
  const radiusM = Math.min(
    10000,
    Math.max(200, radiusRaw ? parseInt(radiusRaw, 10) : SALES_NEARBY_RADIUS_M),
  );

  if (!q) {
    return NextResponse.json({
      query: null,
      geo: null,
      region: null,
      nearby: [],
      pitch: null,
      productNote: PRODUCT_AVAILABILITY_LINE,
      queriedAt: new Date().toISOString(),
    });
  }

  const geo = await forwardGeocode(q);
  if (!geo) {
    return NextResponse.json(
      { error: `Geocoding mislukt voor: ${q}` },
      { status: 404 },
    );
  }

  const db = moatServiceClient();
  const nearby = await fetchSalesNearbyOutcomes(geo.lat, geo.lon, radiusM, db);
  // Prefer named box for the query point (stable pitch language); fall back to nearest cluster tag.
  const regionName =
    moatRegionForCoords(geo.lat, geo.lon)
    || nearby.find(n => n.regional_cluster_id)?.regional_cluster_id
    || 'overig-NL';
  const region = await lookupRegionSummary(regionName, db);
  const pitch = summarizeNearbyForPitch(nearby);

  return NextResponse.json({
    query: q,
    geo: {
      lat: geo.lat,
      lon: geo.lon,
      postcode: geo.postcode ?? null,
      straatnaam: geo.straatnaam ?? null,
      huisnummer: geo.huisnummer ?? null,
      woonplaats: geo.woonplaats ?? null,
    },
    radiusM,
    region,
    nearby: nearby.slice(0, 25),
    pitch,
    productNote: PRODUCT_AVAILABILITY_LINE,
    queriedAt: new Date().toISOString(),
  });
}
