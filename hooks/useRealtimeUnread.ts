'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import type { Message } from '@/lib/support/types';

/**
 * Bijhoudt ongelezen agent-berichten via Supabase Realtime (met JWT-auth)
 * plus een background-poll als fallback voor wanneer Realtime stil is.
 */
export function useRealtimeUnread() {
  const [realtimeUnread, setRealtimeUnread] = useState(0);
  const clientRef = useRef(createClient());

  useEffect(() => {
    const supabase = clientRef.current;
    let active = true;

    async function subscribe() {
      // JWT zodat Supabase Realtime RLS-protected rows ontvangt
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      if (!active) return;

      supabase
        .channel('support-unread-badge')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload: RealtimePostgresInsertPayload<Message>) => {
            if (payload.new.sender_type !== 'agent') return;
            setRealtimeUnread(n => n + 1);

            if (
              typeof document !== 'undefined' &&
              document.visibilityState === 'hidden' &&
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              try {
                new Notification('EarthGND Ondersteuning', {
                  body: payload.new.body?.slice(0, 100) || 'Je hebt een nieuw bericht',
                  icon: '/favicon.ico',
                  tag:  'support-reply',
                });
              } catch { /* browser may block notifications */ }
            }
          },
        )
        .subscribe((status: string, err?: Error) => {
          if (err) console.error('[realtime/badge] subscribe error', err);
        });
    }

    subscribe();

    return () => {
      active = false;
      supabase.removeChannel(supabase.channel('support-unread-badge'));
    };
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
