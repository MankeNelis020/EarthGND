/**
 * GET /api/admin/moat/shadow — Poort-2 shadow_predictions summary + samples.
 */

import { NextResponse } from 'next/server';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { fetchShadowRows, fetchShadowSummary } from '@/lib/moat/shadow-metrics';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const db = moatServiceClient();
  const [summary, resolved, unresolved] = await Promise.all([
    fetchShadowSummary(db),
    fetchShadowRows(db, { resolved: true, limit: 20 }),
    fetchShadowRows(db, { resolved: false, limit: 20 }),
  ]);

  return NextResponse.json({
    summary,
    recentResolved: resolved,
    recentUnresolved: unresolved,
    productNote: PRODUCT_AVAILABILITY_LINE,
    note:
      'Shadow mode: empirical_weight blijft 0 tot Poort-4. Dit dashboard is review, geen productie-blend.',
    queriedAt: new Date().toISOString(),
  });
}
