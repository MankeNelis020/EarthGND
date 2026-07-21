// ─── Enums ────────────────────────────────────────────────────────────────────

export type ConversationCategory = 'calculation' | 'technical' | 'other';

export type ConversationStatus =
  | 'open'
  | 'waiting_for_support'
  | 'waiting_for_customer'
  | 'resolved'
  | 'closed';

export type SenderType = 'user' | 'agent' | 'system';

// ─── Context (auto-verzameld door de widget) ──────────────────────────────────

export interface ConversationContext {
  projectId?:      string;
  calculationId?:  string;
  appVersion?:     string;
  currentRoute?:   string;
  userAgent?:      string;
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export interface MessageAttachment {
  storage_path: string;
  mime:         string;
  size:         number;   // bytes
}

// ─── Database rows ────────────────────────────────────────────────────────────

export interface CalculationSnapshot {
  id:             string;
  calculation_id: string;
  user_id:        string;
  payload:        Record<string, unknown>;
  created_at:     string;
}

export interface Conversation {
  id:                      string;
  user_id:                 string;
  organisation_id:         string | null;
  category:                ConversationCategory;
  status:                  ConversationStatus;
  subject:                 string | null;
  context:                 ConversationContext;
  calculation_snapshot_id: string | null;
  last_message_at:         string;
  created_at:              string;
  updated_at:              string;
}

export interface Message {
  id:              string;
  conversation_id: string;
  sender_type:     SenderType;
  sender_ref:      string;
  body:            string;
  attachments:     MessageAttachment[];
  external_ref:    unknown | null;  // adapter-specifiek (Slack: { thread_ts, channel_id, event_id })
  read_at:         string | null;
  created_at:      string;
}

// ─── Create inputs ────────────────────────────────────────────────────────────

export interface CreateConversationInput {
  user_id:                  string;
  organisation_id?:         string;
  category:                 ConversationCategory;
  subject?:                 string;
  context:                  ConversationContext;
  calculation_snapshot_id?: string;
}

export interface CreateMessageInput {
  conversation_id: string;
  sender_type:     SenderType;
  sender_ref:      string;
  body:            string;
  attachments?:    MessageAttachment[];
  external_ref?:   unknown;
}

// ─── Conversation with messages (voor gespreksweergave) ───────────────────────

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// ─── Unread count (voor badge) ────────────────────────────────────────────────

export interface ConversationSummary extends Conversation {
  unread_count: number;
}
