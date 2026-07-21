'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import type { Message } from '@/lib/support/types';

/**
 * Subscribes to new agent messages via Supabase Realtime.
 * Supabase RLS ensures only the authenticated user's conversations deliver events.
 * Shows a browser Notification when the tab is in the background.
 * Calls onAgentMessage with the full row so callers can update local state.
 */
export function useRealtimeUnread(onAgentMessage?: (message: Message) => void) {
  const [realtimeUnread, setRealtimeUnread] = useState(0);
  const clientRef       = useRef(createClient());
  const onMessageRef    = useRef(onAgentMessage);
  onMessageRef.current  = onAgentMessage;

  useEffect(() => {
    const supabase = clientRef.current;

    const channel = supabase
      .channel('support-agent-messages')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: 'sender_type=eq.agent',
        },
        (payload: RealtimePostgresInsertPayload<Message>) => {
          const message = payload.new;

          setRealtimeUnread(n => n + 1);
          onMessageRef.current?.(message);

          if (
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden' &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification('EarthGND Ondersteuning', {
                body: message.body?.slice(0, 100) || 'Je hebt een nieuw bericht',
                icon: '/favicon.ico',
                tag:  'support-reply',
              });
            } catch { /* browser may block notifications */ }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const resetRealtimeUnread = useCallback(() => setRealtimeUnread(0), []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => { /* user declined */ });
    }
  }, []);

  return { realtimeUnread, resetRealtimeUnread, requestNotificationPermission };
}
