/**
 * GET /api/admin/moat/outcomes?region=&week=&category=&unlinked=1&limit=50
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { fetchMoatOutcomes } from '@/lib/moat/outcomes';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const region = sp.get('region')?.trim() || null;
  const weekStart = sp.get('week')?.trim() || null;
  const category = sp.get('category')?.trim() || null;
  const unlinkedOnly = sp.get('unlinked') === '1' || sp.get('unlinked') === 'true';
  const limitRaw = sp.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 50;

  const db = moatServiceClient();
  const outcomes = await fetchMoatOutcomes(db, {
    region,
    weekStart,
    category,
    unlinkedOnly,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return NextResponse.json({
    filters: { region, weekStart, category, unlinkedOnly, limit },
    count: outcomes.length,
    outcomes,
    productNote: PRODUCT_AVAILABILITY_LINE,
    queriedAt: new Date().toISOString(),
  });
}
