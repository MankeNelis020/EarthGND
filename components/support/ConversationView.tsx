'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import type { ConversationWithMessages, Message, MessageAttachment } from '@/lib/support/types';

interface Props {
  conversation: ConversationWithMessages;
  onBack:       () => void;
  onAddMessage: (conversationId: string, body: string, attachments?: MessageAttachment[]) => Promise<void>;
  onEnqueue:    (conversationId: string, body: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  calculation: 'Berekening',
  technical:   'Technisch',
  other:       'Overig',
};

const STATUS_LABELS: Record<string, string> = {
  open:                 'Open',
  waiting_for_support:  'In behandeling',
  waiting_for_customer: 'Wacht op jou',
  resolved:             'Opgelost',
  closed:               'Gesloten',
};

export function ConversationView({ conversation, onBack, onAddMessage, onEnqueue }: Props) {
  const [body,         setBody]         = useState('');
  const [sending,      setSending]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isClosed = conversation.status === 'closed' || conversation.status === 'resolved';
  const isNew    = conversation.messages.length === 1 && conversation.status === 'waiting_for_support';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.messages.length]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || isClosed) return;

    if (!navigator.onLine) {
      onEnqueue(conversation.id, text);
      setBody('');
      setOfflineSaved(true);
      setTimeout(() => setOfflineSaved(false), 5000);
      return;
    }

    setSending(true);
    setError(null);
    try {
      await onAddMessage(conversation.id, text);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versturen mislukt');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 shrink-0">
        <button onClick={onBack} className="text-[#F5EFE6]/60 hover:text-[#F5EFE6] p-0.5" aria-label="Terug">
          <ChevronLeftIcon />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#F5EFE6] truncate">
            {CATEGORY_LABELS[conversation.category] ?? conversation.category}
          </p>
          <p className="text-xs text-[#F5EFE6]/40">
            {STATUS_LABELS[conversation.status] ?? conversation.status}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {isNew && (
          <div className="rounded-xl bg-[#E8761A]/10 border border-[#E8761A]/20 px-4 py-3 text-center">
            <p className="text-xs text-[#F5EFE6]/70 leading-relaxed">
              Vraag ontvangen. Je krijgt een melding zodra we antwoorden.
            </p>
          </div>
        )}

        {conversation.messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply area */}
      {isClosed ? (
        <div className="shrink-0 border-t border-white/8 px-4 py-3">
          <p className="text-xs text-center text-[#F5EFE6]/40">
            Dit gesprek is {conversation.status === 'resolved' ? 'opgelost' : 'gesloten'}.
          </p>
        </div>
      ) : (
        <div className="shrink-0 border-t border-white/8 p-4 flex flex-col gap-2">
          {offlineSaved && (
            <p className="text-xs text-yellow-400">
              Geen verbinding — bericht opgeslagen en verstuurd zodra je online bent.
            </p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ een antwoord…"
            rows={3}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#F5EFE6] placeholder-[#F5EFE6]/30 resize-none focus:outline-none focus:ring-2 focus:ring-[#E8761A]"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#F5EFE6]/25">⌘↵ om te versturen</span>
            <Button
              onClick={handleSend}
              disabled={!body.trim() || sending}
              loading={sending}
            >
              Versturen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser   = message.sender_type === 'user';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-[#F5EFE6]/30 italic px-3">{message.body}</span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? 'bg-[#E8761A] text-white rounded-br-sm'
            : 'bg-white/10 text-[#F5EFE6] rounded-bl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            {message.attachments.map((att, i) => (
              <span key={i} className={`text-xs flex items-center gap-1 ${isUser ? 'text-white/60' : 'text-[#F5EFE6]/50'}`}>
                <PaperclipIcon />
                {att.storage_path.split('/').pop()}
              </span>
            ))}
          </div>
        )}
        <p className={`text-[10px] mt-1 ${isUser ? 'text-white/50 text-right' : 'text-[#F5EFE6]/35'}`}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
