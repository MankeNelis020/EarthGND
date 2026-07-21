import type { Conversation, Message } from './types';

export interface AgentReply {
  conversationId: string;
  body:           string;
  senderRef:      string;
}

/**
 * Twee methodes — bewust dun gehouden.
 * sendToAgent: schrijf naar extern kanaal (Slack, Chatwoot, …)
 * parseAgentReply: vertaal inkomende webhook-payload naar een AgentReply,
 *   of null als de payload niet relevant is.
 */
export interface SupportAdapter {
  sendToAgent(
    conversation: Conversation,
    message:      Message,
  ): Promise<{ externalRef: unknown }>;

  parseAgentReply(payload: unknown): Promise<AgentReply | null>;
}
