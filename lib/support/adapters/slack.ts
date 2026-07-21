import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupportAdapter, AgentReply } from '../adapter';
import type { Conversation, Message } from '../types';

const SLACK_API = 'https://slack.com/api';

const CATEGORY_LABELS: Record<string, string> = {
  calculation: 'Berekening',
  technical:   'Technisch',
  other:       'Overig',
};

async function slackPost(
  method: string,
  body:   Record<string, unknown>,
  token:  string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

interface ThreadRef {
  thread_ts:  string;
  channel_id: string;
}

export class SlackSupportAdapter implements SupportAdapter {
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }

  private async findExistingThread(conversationId: string): Promise<ThreadRef | null> {
    const { data } = await this.db
      .from('messages')
      .select('external_ref')
      .eq('conversation_id', conversationId)
      .not('external_ref', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const ref = data?.external_ref as ThreadRef | null;
    return ref?.thread_ts ? ref : null;
  }

  async sendToAgent(conversation: Conversation, message: Message): Promise<{ externalRef: unknown }> {
    const token     = process.env.SLACK_BOT_TOKEN!;
    const channelId = process.env.SLACK_SUPPORT_CHANNEL_ID!;

    const existing = await this.findExistingThread(conversation.id);

    if (existing) {
      // Follow-up reply in the existing thread
      const body = message.body.replace(/\n/g, '\n>');
      const res  = await slackPost('chat.postMessage', {
        channel:   existing.channel_id,
        thread_ts: existing.thread_ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${message.sender_ref}* reageerde:\n>${body}`,
            },
          },
        ],
        text: `${message.sender_ref}: ${message.body}`,
      }, token);

      return {
        externalRef: {
          thread_ts:  existing.thread_ts,
          channel_id: existing.channel_id,
          message_ts: res.ts ?? null,
        },
      };
    }

    // First message — open a new thread in the support channel
    const catLabel = CATEGORY_LABELS[conversation.category] ?? conversation.category;
    const route    = (conversation.context as { currentRoute?: string })?.currentRoute ?? '';

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${catLabel} — ${message.sender_ref}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: message.body },
        ...(route ? { fields: [{ type: 'mrkdwn', text: `*Route:*\n${route}` }] } : {}),
      },
      { type: 'divider' },
      {
        type:     'actions',
        block_id: 'conv_actions',
        elements: [
          {
            type:      'button',
            text:      { type: 'plain_text', text: 'Opgelost' },
            style:     'primary',
            action_id: 'resolve_conversation',
            value:     conversation.id,
          },
          {
            type:      'button',
            text:      { type: 'plain_text', text: 'Sluiten' },
            style:     'danger',
            action_id: 'close_conversation',
            value:     conversation.id,
          },
        ],
      },
    ];

    const res = await slackPost('chat.postMessage', {
      channel: channelId,
      blocks,
      text: `[${message.sender_ref}] Nieuwe vraag — ${catLabel}`,
    }, token);

    if (!res.ok || !res.ts) {
      throw new Error(`Slack chat.postMessage mislukt: ${res.error ?? 'onbekend'}`);
    }

    return {
      externalRef: {
        thread_ts:  res.ts as string,
        channel_id: channelId,
        message_ts: res.ts as string,
      },
    };
  }

  async parseAgentReply(payload: unknown): Promise<AgentReply | null> {
    if (
      typeof payload !== 'object' || payload === null ||
      !('conversationId' in payload) ||
      !('body'           in payload) ||
      !('senderRef'      in payload)
    ) return null;

    const p = payload as Record<string, unknown>;
    if (
      typeof p.conversationId !== 'string' ||
      typeof p.body           !== 'string' ||
      typeof p.senderRef      !== 'string'
    ) return null;

    return { conversationId: p.conversationId, body: p.body, senderRef: p.senderRef };
  }
}
