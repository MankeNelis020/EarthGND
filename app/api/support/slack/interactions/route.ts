/**
 * POST /api/support/slack/interactions
 *
 * Slack Interactivity webhook — button clicks from the support channel.
 * Handles:
 *  - resolve_conversation → status = 'resolved'
 *  - close_conversation   → status = 'closed'
 *
 * Security: HMAC-SHA256 signature check via SLACK_SIGNING_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/support/slack-verify';
import { setStatus } from '@/lib/support/service';
import type { ConversationStatus } from '@/lib/support/types';

export const runtime = 'nodejs';

const ACTION_STATUS: Record<string, ConversationStatus> = {
  resolve_conversation: 'resolved',
  close_conversation:   'closed',
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const valid = verifySlackSignature(
    rawBody,
    request.headers.get('x-slack-request-timestamp') ?? '',
    request.headers.get('x-slack-signature') ?? '',
  );
  if (!valid) {
    return NextResponse.json({ error: 'Ongeldige handtekening' }, { status: 401 });
  }

  // Slack sends interactions as URL-encoded JSON in the `payload` field
  const params  = new URLSearchParams(rawBody);
  const payload = JSON.parse(params.get('payload') ?? '{}');

  if (payload.type !== 'block_actions') {
    return NextResponse.json({ ok: true });
  }

  const actions: Array<{ action_id: string; value: string }> = payload.actions ?? [];

  await Promise.allSettled(
    actions
      .filter(a => a.action_id in ACTION_STATUS)
      .map(async a => {
        const status = ACTION_STATUS[a.action_id];
        await setStatus(a.value, status);
        console.info(`[slack/interactions] conversation ${a.value} → ${status}`);
      }),
  );

  // Acknowledge within Slack's 3-second window
  return NextResponse.json({ ok: true });
}
