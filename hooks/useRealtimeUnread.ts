'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

/**
 * Subscribes to new agent messages via Supabase Realtime.
 * Supabase RLS ensures only the authenticated user's conversations deliver events.
 * Shows a browser Notification when the tab is in the background.
 */
export function useRealtimeUnread() {
  const [realtimeUnread, setRealtimeUnread] = useState(0);
  const clientRef = useRef(createClient());

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
        () => {
          setRealtimeUnread(n => n + 1);

          if (
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden' &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification('EarthGND Ondersteuning', {
                body: 'Je hebt een nieuw bericht',
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
