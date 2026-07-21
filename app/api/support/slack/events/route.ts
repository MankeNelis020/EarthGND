/**
 * POST /api/support/slack/events
 *
 * Slack Events API webhook.
 * Handles:
 *  - url_verification challenge (initial setup)
 *  - message events in threads → stores agent reply in DB
 *
 * Security: HMAC-SHA256 signature check via SLACK_SIGNING_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySlackSignature } from '@/lib/support/slack-verify';
import { addAgentReply } from '@/lib/support/service';

export const runtime = 'nodejs';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

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

  const body = JSON.parse(rawBody);

  // Initial URL verification during Slack app setup
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== 'event_callback') {
    return NextResponse.json({ ok: true });
  }

  const event = body.event;

  // Only handle plain thread replies from human users
  const isThreadReply = event.thread_ts && event.thread_ts !== event.ts;
  if (
    event.type !== 'message' ||
    event.subtype ||    // message_changed, message_deleted, bot_message, etc.
    event.bot_id ||     // bot post
    !isThreadReply
  ) {
    return NextResponse.json({ ok: true });
  }

  // Find conversation by the thread_ts stored in messages.external_ref
  const db = getDb();
  const { data: msg } = await db
    .from('messages')
    .select('conversation_id')
    .filter('external_ref->>thread_ts', 'eq', event.thread_ts as string)
    .limit(1)
    .maybeSingle();

  if (!msg?.conversation_id) {
    return NextResponse.json({ ok: true });
  }

  // Use last 4 chars of Slack user ID as agent ref — no PII, no mapping needed
  const senderRef = `AGENT-${(event.user as string | undefined)?.slice(-4) ?? '0000'}`;

  addAgentReply({
    conversationId: msg.conversation_id as string,
    body:           (event.text as string) ?? '',
    senderRef,
    externalRef: {
      event_id:   event.event_ts,
      thread_ts:  event.thread_ts,
      channel_id: event.channel,
    },
  }).catch(err => {
    console.error('[slack/events] addAgentReply mislukt:', err);
  });

  // Acknowledge immediately — Slack expects < 3 s
  return NextResponse.json({ ok: true });
}
