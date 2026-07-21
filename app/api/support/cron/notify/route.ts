/**
 * GET /api/support/cron/notify
 *
 * Vercel cron endpoint — runs every 15 minutes.
 * Sends email notifications for agent replies that have been unread > 15 min.
 *
 * Security: Bearer token in Authorization header must match CRON_SECRET.
 * Vercel sets this automatically when CRON_SECRET is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendPendingEmailNotifications } from '@/lib/support/email-notify';

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

  const { sent, errors } = await sendPendingEmailNotifications();

  console.info(`[cron/notify] verzonden: ${sent}, fouten: ${errors}`);
  return NextResponse.json({ ok: true, sent, errors });
}
