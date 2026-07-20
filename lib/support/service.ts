/**
 * Support Core — service-laag.
 *
 * Regels:
 *  1. DB-write altijd eerst. Faalt de adapter → bericht blijft in DB,
 *     adapter-fout wordt gelogd. Nooit een bericht verliezen.
 *  2. Service-role client: bypasses RLS. Auth-check zit in de API-routes.
 *  3. Welke adapter actief is: env SUPPORT_ADAPTER ('slack' | 'noop').
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Conversation,
  ConversationCategory,
  ConversationContext,
  ConversationStatus,
  ConversationSummary,
  ConversationWithMessages,
  Message,
  MessageAttachment,
} from './types';
import { userIdToPseudonym } from './pseudonym';
import type { SupportAdapter } from './adapter';

// ── DB client (service-role, bypasses RLS) ────────────────────────────────────

function getDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── Adapter singleton ──────────────────────────────────────────────────────────

const noopAdapter: SupportAdapter = {
  async sendToAgent() {
    console.info('[support/noop] sendToAgent — stel SUPPORT_ADAPTER=slack in om te activeren');
    return { externalRef: null };
  },
  async parseAgentReply() {
    return null;
  },
};

let _adapter: SupportAdapter | null = null;

export function getAdapter(): SupportAdapter {
  if (_adapter) return _adapter;
  const which = process.env.SUPPORT_ADAPTER ?? 'noop';
  if (which === 'slack') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SlackSupportAdapter } = require('./adapters/slack');
    _adapter = new SlackSupportAdapter() as SupportAdapter;
  } else {
    _adapter = noopAdapter;
  }
  return _adapter;
}

/** Alleen voor tests — injecteer een mock adapter. */
export function _setAdapterForTest(adapter: SupportAdapter) {
  _adapter = adapter;
}

// ── Rate limit ────────────────────────────────────────────────────────────────

export async function checkRateLimit(userId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.rpc('support_rate_limit_ok', { p_user_id: userId });
  return data === true;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

async function createSnapshot(db: SupabaseClient, userId: string, calculationId: string): Promise<string | null> {
  const { data: calc } = await db
    .from('calculations')
    .select('*')
    .eq('id', calculationId)
    .eq('user_id', userId)
    .single();

  if (!calc) return null;

  const { data: snap } = await db
    .from('calculation_snapshots')
    .insert({ calculation_id: calculationId, user_id: userId, payload: calc })
    .select('id')
    .single();

  return snap?.id ?? null;
}

// ── sendToAdapter (fire-and-forget, verliest nooit het bericht) ───────────────

async function notifyAdapter(db: SupabaseClient, conversation: Conversation, message: Message) {
  try {
    const { externalRef } = await getAdapter().sendToAgent(conversation, message);
    if (externalRef) {
      await db.from('messages').update({ external_ref: externalRef }).eq('id', message.id);
    }
  } catch (err) {
    console.error('[support/service] adapter.sendToAgent mislukt (bericht bewaard in DB):', err);
  }
}

// ── createConversation ────────────────────────────────────────────────────────

export async function createConversation(params: {
  userId:          string;
  category:        ConversationCategory;
  body:            string;
  context:         ConversationContext;
  attachments?:    MessageAttachment[];
  calculationId?:  string;
}): Promise<{ conversation: Conversation; message: Message }> {
  const { userId, category, body, context, attachments = [], calculationId } = params;
  const db = getDb();

  const snapshotId = calculationId
    ? await createSnapshot(db, userId, calculationId)
    : null;

  const { data: conv, error: convErr } = await db
    .from('conversations')
    .insert({
      user_id:                 userId,
      category,
      status:                  'waiting_for_support',
      context,
      calculation_snapshot_id: snapshotId,
    })
    .select()
    .single();

  if (convErr || !conv) throw new Error(`Conversation aanmaken mislukt: ${convErr?.message}`);

  const conversation = conv as Conversation;

  const { data: msg, error: msgErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type:     'user',
      sender_ref:      userIdToPseudonym(userId),
      body,
      attachments,
    })
    .select()
    .single();

  if (msgErr || !msg) throw new Error(`Bericht aanmaken mislukt: ${msgErr?.message}`);

  const message = msg as Message;
  await notifyAdapter(db, conversation, message);

  return { conversation, message };
}

// ── addUserMessage ────────────────────────────────────────────────────────────

export async function addUserMessage(params: {
  conversationId: string;
  userId:         string;
  body:           string;
  attachments?:   MessageAttachment[];
}): Promise<Message> {
  const { conversationId, userId, body, attachments = [] } = params;
  const db = getDb();

  const { data: conv } = await db
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (!conv) throw new Error('Conversation niet gevonden of geen toegang');
  if (conv.status === 'closed') throw new Error('Conversation is gesloten');

  const { data: msg, error } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type:     'user',
      sender_ref:      userIdToPseudonym(userId),
      body,
      attachments,
    })
    .select()
    .single();

  if (error || !msg) throw new Error(`Bericht aanmaken mislukt: ${error?.message}`);

  const message = msg as Message;

  await db
    .from('conversations')
    .update({ status: 'waiting_for_support' })
    .eq('id', conversationId);

  await notifyAdapter(db, conv as Conversation, message);
  return message;
}

// ── addAgentReply (vanuit webhook) ────────────────────────────────────────────

export async function addAgentReply(params: {
  conversationId: string;
  body:           string;
  senderRef:      string;
  externalRef?:   unknown;
}): Promise<Message> {
  const { conversationId, body, senderRef, externalRef } = params;
  const db = getDb();

  const { data: msg, error } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type:     'agent',
      sender_ref:      senderRef,
      body,
      external_ref:    externalRef ?? null,
    })
    .select()
    .single();

  if (error || !msg) throw new Error(`Agent reply aanmaken mislukt: ${error?.message}`);

  await db
    .from('conversations')
    .update({ status: 'waiting_for_customer' })
    .eq('id', conversationId);

  return msg as Message;
}

// ── setStatus ─────────────────────────────────────────────────────────────────

export async function setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('conversations')
    .update({ status })
    .eq('id', conversationId);
  if (error) throw new Error(`Status bijwerken mislukt: ${error.message}`);
}

// ── listConversations ─────────────────────────────────────────────────────────

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const db = getDb();

  const { data, error } = await db
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false });

  if (error) throw new Error(`Conversations ophalen mislukt: ${error.message}`);

  const conversations = (data ?? []) as Conversation[];
  if (conversations.length === 0) return [];

  const ids = conversations.map(c => c.id);
  const { data: unreadRows } = await db
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', ids)
    .eq('sender_type', 'agent')
    .is('read_at', null);

  const unreadCounts: Record<string, number> = {};
  for (const row of (unreadRows ?? [])) {
    const cid = row.conversation_id as string;
    unreadCounts[cid] = (unreadCounts[cid] ?? 0) + 1;
  }

  return conversations.map(c => ({ ...c, unread_count: unreadCounts[c.id] ?? 0 }));
}

// ── getConversation ───────────────────────────────────────────────────────────

export async function getConversation(id: string, userId: string): Promise<ConversationWithMessages> {
  const db = getDb();

  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (convErr || !conv) throw new Error('Conversation niet gevonden');

  const { data: msgs, error: msgsErr } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (msgsErr) throw new Error(`Berichten ophalen mislukt: ${msgsErr.message}`);

  // Markeer ongelezen agent-berichten als gelezen
  const unread = (msgs ?? []).filter(m => m.sender_type === 'agent' && !m.read_at);
  if (unread.length > 0) {
    await db
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unread.map(m => m.id));
  }

  return { ...(conv as Conversation), messages: (msgs ?? []) as Message[] };
}
