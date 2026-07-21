'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import type { Message } from '@/lib/support/types';

/**
 * Bijhoudt het aantal ongelezen agent-berichten via Supabase Realtime.
 * Toont een browser Notification als de tab op de achtergrond staat.
 * Message-state zit in useSupport (zelfde Realtime-event, aparte channel).
 */
export function useRealtimeUnread() {
  const [realtimeUnread, setRealtimeUnread] = useState(0);
  const clientRef = useRef(createClient());

  useEffect(() => {
    const supabase = clientRef.current;

    const channel = supabase
      .channel('support-unread-badge')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
        },
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
