'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface QueuedMessage {
  id:             string;
  conversationId: string;
  body:           string;
  timestamp:      number;
  retries:        number;
}

const QUEUE_KEY  = 'earthgnd_support_offline_queue';
const MAX_RETRIES = 3;

function readQueue(): QueuedMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMessage[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full — best effort */ }
}

export function useOfflineQueue(
  onFlush: (msg: QueuedMessage) => Promise<void>,
) {
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;

    const failed: QueuedMessage[] = [];
    for (const msg of queue) {
      try {
        await onFlushRef.current(msg);
      } catch {
        if (msg.retries < MAX_RETRIES) {
          failed.push({ ...msg, retries: msg.retries + 1 });
        }
      }
    }
    writeQueue(failed);
  }, []);

  useEffect(() => {
    const handleOnline = () => { flushQueue(); };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) flushQueue();
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue]);

  const enqueue = useCallback((params: { conversationId: string; body: string }) => {
    const queue = readQueue();
    const id    = `q-${params.conversationId.slice(0, 8)}-${queue.length}`;
    queue.push({ id, ...params, timestamp: Date.now(), retries: 0 });
    writeQueue(queue);
  }, []);

  return { enqueue, flushQueue };
}
