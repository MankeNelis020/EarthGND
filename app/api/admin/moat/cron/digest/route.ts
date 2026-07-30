/**
 * GET /api/admin/moat/cron/digest
 * Vercel cron — Monday morning weekly ops digest to ADMIN_EMAILS.
 * Auth: Bearer CRON_SECRET (same pattern as support notify).
 * ?dryRun=1 — build preview without sending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAndSendWeeklyMoatDigest } from '@/lib/moat/weekly-digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Onbevoegd' }, { status: 401 });
    }
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const result = await buildAndSendWeeklyMoatDigest({ dryRun });

  console.info(
    `[moat/cron/digest] sent=${result.sent} skipped=${result.skipped} reason=${result.reason ?? '-'}`,
  );

  return NextResponse.json({ ok: true, ...result });
}
