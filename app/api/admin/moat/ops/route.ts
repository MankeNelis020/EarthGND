/**
 * GET /api/admin/moat/ops — operations funnel + weekly + regional health.
 */

import { NextResponse } from 'next/server';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { fetchOpsFunnel, fetchOpsRegionHealth, fetchOpsWeekly } from '@/lib/moat/ops-metrics';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const db = moatServiceClient();
  const [funnel, weekly, regions] = await Promise.all([
    fetchOpsFunnel(db),
    fetchOpsWeekly(db, 12),
    fetchOpsRegionHealth(db),
  ]);

  const thisWeek = weekly[0]?.count ?? 0;
  const weeklyTarget = 6;
  const predictionLinkPct = funnel.totalOutcomes
    ? Math.round((funnel.withPredictionLink / funnel.totalOutcomes) * 100)
    : 0;

  const blockers: { severity: 'warn' | 'info'; message: string }[] = [];
  if (predictionLinkPct < 50 && funnel.totalOutcomes > 0) {
    blockers.push({
      severity: 'warn',
      message:
        `${100 - predictionLinkPct}% outcomes zonder prediction-link (vaak manual import zonder calculation_id) — dieptefout blijft NULL.`,
    });
  }
  if (thisWeek < weeklyTarget) {
    blockers.push({
      severity: 'info',
      message: `Deze week ${thisWeek}/${weeklyTarget} outcomes — onder richttempo voor groei naar 500.`,
    });
  }
  if (funnel.outliers > 0) {
    blockers.push({
      severity: 'info',
      message: `${funnel.outliers} outlier(s) gemarkeerd (|dieptefout%| > μ+3σ in regio).`,
    });
  }

  return NextResponse.json({
    funnel,
    weekly,
    regions,
    summary: {
      thisWeek,
      weeklyTarget,
      predictionLinkPct,
      knowledgePct: funnel.totalOutcomes
        ? Math.round((funnel.knowledgeProcessed / funnel.totalOutcomes) * 100)
        : 0,
    },
    blockers,
    productNote: PRODUCT_AVAILABILITY_LINE,
    queriedAt: new Date().toISOString(),
  });
}
