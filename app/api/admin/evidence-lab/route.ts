/**
 * GET /api/admin/evidence-lab — Evidence & Calibration Lab snapshot
 */

import { NextResponse } from 'next/server';
import { requireMoatAdmin } from '@/lib/moat/admin-auth';
import { loadEvidenceLabSnapshot } from '@/lib/evidence-lab/load-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  try {
    const snapshot = await loadEvidenceLabSnapshot();
    return NextResponse.json(snapshot);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'Evidence Lab laden mislukt',
        safety: {
          productionPredictionUnchanged: true,
          statement: 'Production prediction behavior remains unchanged',
        },
      },
      { status: 500 },
    );
  }
}
