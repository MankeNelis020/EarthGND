/**
 * Admin import endpoint voor handmatige veldmetingen.
 *
 * Gebruikt door de Google Sheets Apps Script om nieuwe rijen automatisch
 * te importeren. Authenticatie via x-import-key header (IMPORT_API_KEY env var).
 *
 * Doet exact hetzelfde als scripts/import-measurements.ts:
 *   1. Geocodeert adres als lat/lon ontbreekt
 *   2. Voegt toe aan pendiepte_metingen (status=confirmed, source_type=manual_import)
 *   3. Triggert processMeting → soil_evidence + global_prior + regional_prior
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { forwardGeocode } from '@/lib/geocoding';
import { wgs84ToRd } from '@/lib/rd';
import { processMeting } from '@/lib/soil-knowledge/evidence-accumulator';

export const runtime = 'nodejs';

interface ImportBody {
  straatnaam?:         string;
  huisnummer?:         string;
  postcode?:           string;
  woonplaats?:         string;
  lat?:                number;
  lon?:                number;
  field_gw_depth?:     number;
  bro_litho_class?:    number;
  bro_gw_depth?:       number;
  measurement_quality?: string;
  notes?:              string;
  depthCurve:          { depth: number; ra: number }[];
}

export async function POST(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const apiKey = request.headers.get('x-import-key');
  const expectedKey = process.env.IMPORT_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as ImportBody;

  if (!body.depthCurve?.length) {
    return NextResponse.json({ error: 'depthCurve verplicht' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // ── Geocoding ──────────────────────────────────────────────────────────────
  let lat = body.lat ?? null;
  let lon = body.lon ?? null;

  if ((lat == null || lon == null) && (body.straatnaam || body.postcode)) {
    const query = [body.straatnaam, body.huisnummer, body.postcode, body.woonplaats]
      .filter(Boolean).join(' ');
    const geo = await forwardGeocode(query);
    if (geo) { lat = geo.lat; lon = geo.lon; }
  }

  const rd = lat != null && lon != null ? wgs84ToRd(lat, lon) : null;
  const lastPoint = body.depthCurve.at(-1);

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { data, error } = await admin
    .from('pendiepte_metingen')
    .insert({
      source_type:         'manual_import',
      status:              'confirmed',
      lat,
      lon,
      gps_accuracy_m:      null,
      location_source:     lat != null ? 'manual_import' : 'address',
      rd_x:                rd ? Math.round(rd.rdX) : null,
      rd_y:                rd ? Math.round(rd.rdY) : null,
      postcode:            body.postcode            ?? null,
      straatnaam:          body.straatnaam          ?? null,
      huisnummer:          body.huisnummer ? String(body.huisnummer) : null,
      woonplaats:          body.woonplaats          ?? null,
      depth_curve:         body.depthCurve,
      achieved_ra:         lastPoint?.ra            ?? null,
      installed_depth:     lastPoint?.depth         ?? null,
      electrode_type:      'pen',
      measurement_quality: body.measurement_quality ?? 'goed',
      electrode_count:     1,
      bro_litho_class:     body.bro_litho_class     ?? null,
      bro_gw_depth:        body.bro_gw_depth        ?? null,
      field_gw_depth:      body.field_gw_depth      ?? null,
      notes:               body.notes               ?? null,
      version_tag:         '2026-06',
      submitted_at:        new Date().toISOString(),
      confirmed_at:        new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert mislukt' }, { status: 500 });
  }

  // ── Kennisbank (fire-and-forget) ───────────────────────────────────────────
  processMeting(data.id, admin).catch(e =>
    console.error('[import-meting/processMeting]', e),
  );

  return NextResponse.json({ ok: true, id: data.id });
}
