'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  ConversationSummary,
  ConversationWithMessages,
  ConversationCategory,
  MessageAttachment,
  Message,
} from '@/lib/support/types';

interface State {
  conversations:      ConversationSummary[];
  activeConversation: ConversationWithMessages | null;
  isLoading:          boolean;
  error:              string | null;
  isUnauthenticated:  boolean;
}

interface CreateConvInput {
  category:     ConversationCategory;
  body:         string;
  attachments?: MessageAttachment[];
}

export function useSupport() {
  const [state, setState] = useState<State>({
    conversations:      [],
    activeConversation: null,
    isLoading:          false,
    error:              null,
    isUnauthenticated:  false,
  });

  const loadingRef = useRef(false);

  function patch(update: Partial<State>) {
    setState(s => ({ ...s, ...update }));
  }

  const loadConversations = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    patch({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/support/conversations');
      if (res.status === 401) { patch({ isUnauthenticated: true, isLoading: false }); return; }
      if (!res.ok) throw new Error('Laden mislukt');
      const data = await res.json();
      patch({ conversations: data.conversations ?? [], isLoading: false, isUnauthenticated: false });
    } catch {
      patch({ error: 'Gesprekken laden mislukt', isLoading: false });
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    patch({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/support/conversations/${id}`);
      if (!res.ok) throw new Error('Gesprek laden mislukt');
      const data = await res.json();
      patch({ activeConversation: data.conversation, isLoading: false });
    } catch {
      patch({ error: 'Gesprek laden mislukt', isLoading: false });
    }
  }, []);

  const createConversation = useCallback(async (input: CreateConvInput): Promise<string> => {
    const context = {
      currentRoute: typeof window !== 'undefined' ? window.location.pathname : undefined,
      userAgent:    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : undefined,
      appVersion:   process.env.NEXT_PUBLIC_APP_VERSION,
    };

    const res = await fetch('/api/support/conversations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        category:    input.category,
        body:        input.body,
        attachments: input.attachments ?? [],
        context,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Aanmaken mislukt');
    }

    const data = await res.json();
    return data.conversation.id as string;
  }, []);

  const addMessage = useCallback(async (
    conversationId: string,
    body:           string,
    attachments:    MessageAttachment[] = [],
  ): Promise<void> => {
    const res = await fetch(`/api/support/conversations/${conversationId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body, attachments }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Versturen mislukt');
    }

    const data = await res.json();
    const newMessage = data.message as Message;

    setState(s => {
      if (!s.activeConversation || s.activeConversation.id !== conversationId) return s;
      return {
        ...s,
        activeConversation: {
          ...s.activeConversation,
          messages: [...s.activeConversation.messages, newMessage],
        },
      };
    });
  }, []);

  const clearActiveConversation = useCallback(() => {
    patch({ activeConversation: null });
  }, []);

  const appendAgentMessage = useCallback((message: Message) => {
    setState(s => {
      if (!s.activeConversation || s.activeConversation.id !== message.conversation_id) return s;
      // Deduplicate: don't append if the message is already in the list
      if (s.activeConversation.messages.some(m => m.id === message.id)) return s;
      return {
        ...s,
        activeConversation: {
          ...s.activeConversation,
          status:   'waiting_for_customer',
          messages: [...s.activeConversation.messages, message],
        },
      };
    });
  }, []);

  return {
    conversations:         state.conversations,
    activeConversation:    state.activeConversation,
    isLoading:             state.isLoading,
    error:                 state.error,
    isUnauthenticated:     state.isUnauthenticated,
    loadConversations,
    openConversation,
    createConversation,
    addMessage,
    clearActiveConversation,
    appendAgentMessage,
  };
}
