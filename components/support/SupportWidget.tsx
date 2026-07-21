'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useSupport } from '@/hooks/useSupport';
import { useRealtimeUnread } from '@/hooks/useRealtimeUnread';
import { useOfflineQueue } from './useOfflineQueue';
import { ConversationList } from './ConversationList';
import { NewConversationForm } from './NewConversationForm';
import { ConversationView } from './ConversationView';
import type { ConversationCategory, MessageAttachment } from '@/lib/support/types';

type PanelView = 'list' | 'new' | 'conversation';

export function SupportWidget() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('list');
  const [loaded,    setLoaded]    = useState(false);
  const locale = useLocale();

  const {
    conversations,
    activeConversation,
    isLoading,
    error,
    isUnauthenticated,
    loadConversations,
    openConversation,
    createConversation,
    addMessage,
    clearActiveConversation,
    appendAgentMessage,
  } = useSupport();

  const { realtimeUnread, resetRealtimeUnread, requestNotificationPermission } = useRealtimeUnread(appendAgentMessage);

  const { enqueue } = useOfflineQueue(async (msg) => {
    await addMessage(msg.conversationId, msg.body);
  });

  const dbUnread    = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  const totalUnread = Math.max(dbUnread, realtimeUnread);

  const openPanel = useCallback(async () => {
    setIsOpen(true);
    resetRealtimeUnread();
    await requestNotificationPermission();
    if (!loaded) {
      setLoaded(true);
      await loadConversations();
    }
  }, [loaded, loadConversations, resetRealtimeUnread, requestNotificationPermission]);

  const closePanel = () => setIsOpen(false);

  const handleNewConv = async (
    category:    ConversationCategory,
    body:        string,
    attachments: MessageAttachment[],
  ) => {
    const id = await createConversation({ category, body, attachments });
    await openConversation(id);
    setPanelView('conversation');
  };

  const handleConvSelect = async (id: string) => {
    await openConversation(id);
    setPanelView('conversation');
  };

  const handleBackToList = async () => {
    clearActiveConversation();
    setPanelView('list');
    await loadConversations();
  };

  const handleEnqueue = (conversationId: string, body: string) => {
    enqueue({ conversationId, body });
  };

  return (
    <>
      {/* Backdrop — alleen zichtbaar op mobile; op desktop valt panel naast content */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel — mobile: slide-up full-width; desktop: vaste breedte 1/3 rechtsonder */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ondersteuning"
        className={`
          fixed z-50 flex flex-col bg-[#1C1917] shadow-2xl transition-all duration-300 ease-out
          border-white/10
          bottom-0 inset-x-0 rounded-t-2xl border-t
          md:bottom-4 md:right-4 md:inset-x-auto md:rounded-2xl md:border
          md:w-[min(33vw,440px)] md:min-w-[360px]
          ${isOpen
            ? 'translate-y-0 opacity-100'
            : 'translate-y-4 opacity-0 pointer-events-none md:translate-y-2'
          }
        `}
        style={{
          maxHeight: '85dvh',
          height:    '85dvh',
        }}
      >
        {/* Drag handle (mobile) + sluitknop */}
        <div className="relative flex items-center justify-center px-4 pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20 md:hidden" />
          <button
            onClick={closePanel}
            className="absolute right-3 top-2.5 text-[#F5EFE6]/50 hover:text-[#F5EFE6] p-1 rounded-lg hover:bg-white/5"
            aria-label="Sluiten"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {/* Niet ingelogd */}
          {isUnauthenticated && (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center h-full">
              <LockIcon />
              <div>
                <p className="text-sm font-semibold text-[#F5EFE6]">Inloggen vereist</p>
                <p className="mt-1 text-xs text-[#F5EFE6]/50">
                  Je hebt een account nodig om contact op te nemen met ondersteuning.
                </p>
              </div>
              <a
                href={`/${locale}/login`}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E8761A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
              >
                Inloggen
              </a>
            </div>
          )}

          {!isUnauthenticated && panelView === 'list' && (
            <ConversationList
              conversations={conversations}
              isLoading={isLoading}
              error={error}
              onSelect={handleConvSelect}
              onNewConv={() => setPanelView('new')}
            />
          )}

          {!isUnauthenticated && panelView === 'new' && (
            <NewConversationForm
              onSubmit={handleNewConv}
              onBack={() => setPanelView('list')}
            />
          )}

          {!isUnauthenticated && panelView === 'conversation' && activeConversation && (
            <ConversationView
              conversation={activeConversation}
              onBack={handleBackToList}
              onAddMessage={addMessage}
              onEnqueue={handleEnqueue}
            />
          )}

          {!isUnauthenticated && panelView === 'conversation' && !activeConversation && isLoading && (
            <div className="flex h-full items-center justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#E8761A]" />
            </div>
          )}
        </div>

        {/* Safe-area spacer (iOS) */}
        <div className="shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>

      {/* Zwevende knop */}
      <button
        onClick={openPanel}
        className={`fixed bottom-6 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8761A] text-white shadow-lg transition-all duration-200 hover:bg-[#d06510] focus:outline-none focus:ring-2 focus:ring-[#E8761A] focus:ring-offset-2 focus:ring-offset-[#1C1917] ${
          isOpen ? 'scale-75 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
        }`}
        aria-label="Ondersteuning"
        aria-expanded={isOpen}
      >
        <ChatIcon />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-10 w-10 text-[#F5EFE6]/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
