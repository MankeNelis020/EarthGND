/**
 * GET /api/admin/moat — Moat spine + board view (Sprint 1–2).
 * POST /api/admin/moat — refresh regional_signatures + meting metrics.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { deriveMoatBoardView } from '@/lib/moat/derive';
import type {
  GeographicStrengthRow,
  GrowthTrajectoryRow,
  MoatIndex,
  MoatSpinePayload,
} from '@/lib/moat/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) };
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(user.email ?? '')) {
    return {
      error: NextResponse.json(
        { error: 'Geen toegang — voeg je e-mail toe aan ADMIN_EMAILS' },
        { status: 403 },
      ),
    };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = service();
  const notes: string[] = [];

  const [{ data: moatRaw, error: moatErr }, { data: geoRaw, error: geoErr }, { data: growthRaw, error: growthErr }, { count }] =
    await Promise.all([
      db.rpc('calculate_moat_index'),
      db.rpc('moat_geographic_strength'),
      db.rpc('moat_growth_trajectory'),
      db.from('regional_signatures').select('id', { count: 'exact', head: true }),
    ]);

  if (moatErr || geoErr || growthErr) {
    notes.push(
      'RPC ontbreekt of faalde — draai supabase/moat_data_spine_migration.sql (+ moat_labels_sprint2_migration.sql).',
    );
    if (moatErr) notes.push(`calculate_moat_index: ${moatErr.message}`);
    if (geoErr) notes.push(`moat_geographic_strength: ${geoErr.message}`);
    if (growthErr) notes.push(`moat_growth_trajectory: ${growthErr.message}`);
  }

  const moatIndex = (moatRaw as MoatIndex | null) ?? null;
  const geographic = (geoRaw as GeographicStrengthRow[]) ?? [];
  const growth = (growthRaw as GrowthTrajectoryRow[]) ?? [];

  const payload: MoatSpinePayload = {
    moatIndex,
    geographic,
    growth,
    signatureCount: count ?? 0,
    board: deriveMoatBoardView(moatIndex, geographic, growth),
    notes,
    queriedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = service();
  const { data, error } = await db.rpc('refresh_regional_signatures');
  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: 'Draai supabase/moat_data_spine_migration.sql als de functie nog niet bestaat.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    signatureCount: data,
    refreshedAt: new Date().toISOString(),
  });
}
