'use client';

import type { ConversationSummary, ConversationCategory, ConversationStatus } from '@/lib/support/types';

interface Props {
  conversations: ConversationSummary[];
  onSelect:      (id: string) => void;
  onNewConv:     () => void;
  isLoading:     boolean;
  error:         string | null;
}

const CATEGORY_LABELS: Record<ConversationCategory, string> = {
  calculation: 'Berekening',
  technical:   'Technisch',
  other:       'Overig',
};

const STATUS_CONFIG: Record<ConversationStatus, { label: string; cls: string }> = {
  open:                 { label: 'Open',          cls: 'text-emerald-400 bg-emerald-400/10' },
  waiting_for_support:  { label: 'In behandeling', cls: 'text-yellow-400 bg-yellow-400/10' },
  waiting_for_customer: { label: 'Wacht op jou',  cls: 'text-blue-400   bg-blue-400/10'   },
  resolved:             { label: 'Opgelost',       cls: 'text-[#F5EFE6]/40 bg-white/5'    },
  closed:               { label: 'Gesloten',       cls: 'text-[#F5EFE6]/30 bg-white/5'    },
};

export function ConversationList({ conversations, onSelect, onNewConv, isLoading, error }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <h2 className="text-base font-semibold text-[#F5EFE6]">Ondersteuning</h2>
        <button
          onClick={onNewConv}
          className="flex items-center gap-1.5 rounded-lg bg-[#E8761A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d06510] transition-colors"
        >
          <PlusIcon />
          Nieuw gesprek
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#E8761A]" />
          </div>
        )}

        {!isLoading && error && (
          <p className="px-4 py-8 text-center text-sm text-red-400">{error}</p>
        )}

        {!isLoading && !error && conversations.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <ChatBubbleIcon />
            <p className="text-sm text-[#F5EFE6]/50">Nog geen gesprekken</p>
            <button onClick={onNewConv} className="text-sm text-[#E8761A] hover:underline">
              Start een gesprek
            </button>
          </div>
        )}

        {!isLoading && !error && conversations.map(conv => {
          const s = STATUS_CONFIG[conv.status];
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className="w-full flex items-start gap-3 px-4 py-3.5 border-b border-white/5 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#F5EFE6]">
                    {CATEGORY_LABELS[conv.category]}
                  </span>
                  <span className="text-xs text-[#F5EFE6]/40 shrink-0">
                    {relativeDate(conv.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                    {s.label}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-[#E8761A] text-[10px] font-bold text-white">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRightIcon />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function relativeDate(iso: string): string {
  try {
    const d    = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 86_400_000) return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    if (diff < 172_800_000) return 'gisteren';
    if (diff < 604_800_000) return d.toLocaleDateString('nl-NL', { weekday: 'short' });
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="shrink-0 mt-0.5 text-[#F5EFE6]/30" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg className="h-10 w-10 text-[#F5EFE6]/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
