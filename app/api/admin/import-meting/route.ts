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
  external_import_id?: string;
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

  // Dedup op external_import_id (Google Sheets rij-ID)
  if (body.external_import_id) {
    const { data: existing } = await admin
      .from('pendiepte_metingen')
      .select('id')
      .eq('external_import_id', body.external_import_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
    }
  }

  // ── Coördinaten normaliseren ──────────────────────────────────────────────
  // Google Sheets slaat coördinaten soms op als integer zonder decimaal punt:
  //   52.46178 → 5246178 of 52189534 → 52.189534
  // Detecteer dit door te kijken of de waarde buiten WGS84-NL-grenzen valt
  // en deel dan herhaaldelijk door 10 totdat de waarde in bereik is.
  function normalizeWGS84Coord(v: number | null | undefined, type: 'lat' | 'lon'): number | null {
    if (v == null || !Number.isFinite(v)) return null;
    const [min, max] = type === 'lat' ? [50.5, 53.7] : [3.2, 7.3];
    if (v >= min && v <= max) return v;
    let x = v;
    for (let i = 0; i < 8; i++) {
      x /= 10;
      if (x >= min && x <= max) return Math.round(x * 1_000_000) / 1_000_000;
    }
    return null; // Kan niet normaliseren → gecoder adres als fallback
  }

  // ── Geocoding ──────────────────────────────────────────────────────────────
  let lat = normalizeWGS84Coord(body.lat, 'lat');
  let lon = normalizeWGS84Coord(body.lon, 'lon');

  if ((lat == null || lon == null) && (body.straatnaam || body.postcode)) {
    const query = [body.straatnaam, body.huisnummer, body.postcode, body.woonplaats]
      .filter(Boolean).join(' ');
    const geo = await forwardGeocode(query);
    if (geo) { lat = geo.lat; lon = geo.lon; }
  }

  // Valideer dat lat/lon binnen Nederland liggen voordat we RD berekenen.
  const nlLat = lat != null && lat >= 50.5 && lat <= 53.7;
  const nlLon = lon != null && lon >= 3.2  && lon <= 7.3;
  const rd = (nlLat && nlLon) ? wgs84ToRd(lat!, lon!) : null;

  // Extra guard: RD-coördinaten moeten binnen PostgreSQL integer-bereik én NL-grenzen vallen.
  const PG_INT_MAX = 2_147_483_647;
  const rdX = rd && Number.isFinite(rd.rdX) && Math.abs(rd.rdX) <= PG_INT_MAX ? Math.round(rd.rdX) : null;
  const rdY = rd && Number.isFinite(rd.rdY) && Math.abs(rd.rdY) <= PG_INT_MAX ? Math.round(rd.rdY) : null;

  const lastPoint = body.depthCurve.at(-1);

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { data, error } = await admin
    .from('pendiepte_metingen')
    .insert({
      status:              'confirmed',
      lat,
      lon,
      gps_accuracy_m:      null,
      location_source:     lat != null ? 'manual_import' : 'address',
      rd_x:                rdX,
      rd_y:                rdY,
      postcode:            body.postcode            ?? null,
      straatnaam:          body.straatnaam          ?? null,
      huisnummer:          body.huisnummer ? String(body.huisnummer) : null,
      woonplaats:          body.woonplaats          ?? null,
      depth_curve:         body.depthCurve,
      achieved_ra:         lastPoint?.ra            ?? null,
      installed_depth:     lastPoint?.depth         ?? null,
      electrode_type:      'pen',
      aantal_pennen:       1,
      rods:                [],
      measurement_quality: body.measurement_quality ?? 'goed',
      bro_litho_class:     body.bro_litho_class     ?? null,
      bro_gw_depth:        body.bro_gw_depth        ?? null,
      field_gw_depth:      body.field_gw_depth      ?? null,
      external_import_id:  body.external_import_id  ?? null,
      source_type:         'manual_import',
      notes:               body.notes               ?? null,
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
