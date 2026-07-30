/**
 * GET /api/admin/moat — Moat spine + board view (Sprint 1–2).
 * POST /api/admin/moat — refresh regional_signatures + meting metrics.
 */

import { NextResponse } from 'next/server';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { deriveMoatBoardView } from '@/lib/moat/derive';
import type {
  GeographicStrengthRow,
  GrowthTrajectoryRow,
  MoatIndex,
  MoatSpinePayload,
} from '@/lib/moat/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const db = moatServiceClient();
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
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const db = moatServiceClient();
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
