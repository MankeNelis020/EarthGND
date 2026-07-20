'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import type { ConversationCategory, MessageAttachment } from '@/lib/support/types';

interface Props {
  onSubmit: (category: ConversationCategory, body: string, attachments: MessageAttachment[]) => Promise<void>;
  onBack:   () => void;
}

interface UploadedFile {
  storage_path: string;
  mime:         string;
  size:         number;
  name:         string;
}

const CATEGORIES: { key: ConversationCategory; label: string; detail: string }[] = [
  { key: 'calculation', label: 'Berekening',  detail: 'Vraag over weerstand, diepte of resultaat' },
  { key: 'technical',   label: 'Technisch',   detail: 'Probleem met de applicatie'                },
  { key: 'other',       label: 'Overig',      detail: 'Iets anders'                               },
];

export function NewConversationForm({ onSubmit, onBack }: Props) {
  const [category,  setCategory]  = useState<ConversationCategory | null>(null);
  const [body,      setBody]      = useState('');
  const [files,     setFiles]     = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending,   setSending]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fileRef     = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCategorySelect = (cat: ConversationCategory) => {
    setCategory(cat);
    setTimeout(() => textareaRef.current?.focus(), 60);
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (files.length >= 5) { setError('Maximaal 5 bijlagen per bericht'); return; }

    setUploading(true);
    setError(null);
    try {
      const signRes = await fetch('/api/support/attachments/sign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ filename: file.name, mime: file.type, size: file.size }),
      });
      if (!signRes.ok) {
        const d = await signRes.json().catch(() => ({}));
        throw new Error(d.error ?? 'Upload mislukt');
      }
      const { signedUrl, storage_path, mime } = await signRes.json();

      const uploadRes = await fetch(signedUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      });
      if (!uploadRes.ok) throw new Error('Upload naar storage mislukt');

      setFiles(prev => [...prev, { storage_path, mime, size: file.size, name: file.name }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload mislukt');
    } finally {
      setUploading(false);
    }
  }, [files.length]);

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i));

  const handleSubmit = async () => {
    if (!category || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const attachments: MessageAttachment[] = files.map(f => ({
        storage_path: f.storage_path,
        mime:         f.mime,
        size:         f.size,
      }));
      await onSubmit(category, body.trim(), attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versturen mislukt');
      setSending(false);
    }
  };

  if (!category) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-[#F5EFE6]/60 hover:text-[#F5EFE6] p-0.5" aria-label="Terug">
            <ChevronLeftIcon />
          </button>
          <h2 className="text-base font-semibold text-[#F5EFE6]">Nieuw gesprek</h2>
        </div>
        <p className="text-sm text-[#F5EFE6]/60">Waarover gaat jouw vraag?</p>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => handleCategorySelect(c.key)}
              className="flex flex-col items-start rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-left hover:border-[#E8761A]/50 hover:bg-[#E8761A]/5 transition-colors"
            >
              <span className="text-sm font-semibold text-[#F5EFE6]">{c.label}</span>
              <span className="mt-0.5 text-xs text-[#F5EFE6]/50">{c.detail}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const catLabel = CATEGORIES.find(c => c.key === category)?.label ?? '';

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCategory(null)}
          className="text-[#F5EFE6]/60 hover:text-[#F5EFE6] p-0.5"
          aria-label="Terug naar categorieën"
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="text-base font-semibold text-[#F5EFE6]">{catLabel}</h2>
      </div>

      <textarea
        ref={textareaRef}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Beschrijf je vraag of probleem..."
        rows={5}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#F5EFE6] placeholder-[#F5EFE6]/30 resize-none focus:outline-none focus:ring-2 focus:ring-[#E8761A]"
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-[#F5EFE6]/70">
              <PaperclipIcon />
              <span className="max-w-[110px] truncate">{f.name}</span>
              <button onClick={() => removeFile(i)} className="ml-0.5 text-[#F5EFE6]/40 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-[#F5EFE6]/40 leading-relaxed">
        We reageren meestal binnen enkele uren op werkdagen. Je kunt dit scherm veilig sluiten.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || files.length >= 5}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2.5 text-xs text-[#F5EFE6]/70 hover:border-white/20 disabled:opacity-40 transition-colors shrink-0"
          aria-label="Foto toevoegen"
        >
          {uploading
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#F5EFE6]/30 border-t-[#F5EFE6]" />
            : <CameraIcon />
          }
          Foto
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          onClick={handleSubmit}
          disabled={!body.trim() || sending || uploading}
          loading={sending}
          className="flex-1"
        >
          Versturen
        </Button>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
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
