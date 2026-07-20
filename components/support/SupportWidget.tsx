'use client';

import { useState, useCallback } from 'react';
import { useSupport } from '@/hooks/useSupport';
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

  const {
    conversations,
    activeConversation,
    isLoading,
    error,
    loadConversations,
    openConversation,
    createConversation,
    addMessage,
    clearActiveConversation,
  } = useSupport();

  const { enqueue } = useOfflineQueue(async (msg) => {
    await addMessage(msg.conversationId, msg.body);
  });

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  const openPanel = useCallback(async () => {
    setIsOpen(true);
    if (!loaded) {
      setLoaded(true);
      await loadConversations();
    }
  }, [loaded, loadConversations]);

  const closePanel = () => setIsOpen(false);

  const handleNewConv = async (
    category: ConversationCategory,
    body:     string,
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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Slide-up panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ondersteuning"
        className={`fixed bottom-0 inset-x-0 z-50 flex flex-col rounded-t-2xl bg-[#1C1917] border-t border-white/10 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85dvh', height: '85dvh' }}
      >
        {/* Drag handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20 mx-auto" />
          <button
            onClick={closePanel}
            className="absolute right-4 top-3 text-[#F5EFE6]/50 hover:text-[#F5EFE6] p-1"
            aria-label="Sluiten"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {panelView === 'list' && (
            <ConversationList
              conversations={conversations}
              isLoading={isLoading}
              error={error}
              onSelect={handleConvSelect}
              onNewConv={() => setPanelView('new')}
            />
          )}

          {panelView === 'new' && (
            <NewConversationForm
              onSubmit={handleNewConv}
              onBack={() => setPanelView('list')}
            />
          )}

          {panelView === 'conversation' && activeConversation && (
            <ConversationView
              conversation={activeConversation}
              onBack={handleBackToList}
              onAddMessage={addMessage}
              onEnqueue={handleEnqueue}
            />
          )}

          {panelView === 'conversation' && !activeConversation && isLoading && (
            <div className="flex h-full items-center justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#E8761A]" />
            </div>
          )}
        </div>

        {/* Safe-area spacer */}
        <div className="shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>

      {/* Floating button */}
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
