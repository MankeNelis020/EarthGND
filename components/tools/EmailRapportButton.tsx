'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import type { DiepteRapportProps } from '@/components/pdf/DiepteRapportTemplate';
import { IconCheck, IconMail } from '@/components/ui/icons';

interface Props {
  tool: 'ohm' | 'diepte';
  inputValues: Record<string, string | number>;
  results: Record<string, string | number>;
  warning?: string;
  diepteCalcResult?: DiepteRapportProps;
  calculationId?: string | null;
}

export function EmailRapportButton({ tool, inputValues, results, warning, diepteCalcResult, calculationId, className }: Props & { className?: string }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'sending' | 'sent' | 'login' | 'error'>('idle');

  const returnPath =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : tool === 'ohm' ? '/tool/weerstand' : '/tool/diepte';

  async function handleClick() {
    setStatus('checking');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setStatus('login');
      return;
    }

    setStatus('sending');
    try {
      const res = await fetch('/api/email/rapport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, inputValues, results, warning, diepteCalcResult }),
      });
      if (!res.ok) throw new Error('Verzenden mislukt');

      if (calculationId) {
        fetch(`/api/calculations/${calculationId}/draft`, { method: 'POST' }).catch(() => {/* non-blocking */});
      }

      setStatus('sent');
      setTimeout(() => setStatus('idle'), 5000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  if (status === 'login') {
    return (
      <div className="mt-4 rounded-lg border border-white/10 bg-white/3 p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">Inloggen vereist</p>
        <p className="mb-4 text-xs text-white/55">
          Maak een account aan of log in om dit rapport per e-mail te ontvangen.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/login?redirect=${encodeURIComponent(returnPath)}`}
            className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Inloggen of registreren
          </Link>
          <button
            onClick={() => setStatus('idle')}
            className="text-xs text-white/50 hover:text-white/75 transition-colors"
          >
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  const isBusy = status === 'checking' || status === 'sending';
  const isSent = status === 'sent';

  return (
    <div className={className ?? 'mt-4 flex flex-col gap-2'}>
      <button
        onClick={handleClick}
        disabled={isBusy || isSent}
        className={`flex h-full w-full items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-semibold transition-colors
          ${isSent
            ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400 cursor-default'
            : isBusy
            ? 'border-white/10 bg-white/5 text-white/40 cursor-wait'
            : 'border-white/12 bg-white/4 text-white/85 hover:border-white/20 hover:bg-white/6'
          }`}
      >
        {isSent ? (
          <>
            <IconCheck className="h-4 w-4" />
            Mail verzonden
          </>
        ) : isBusy ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            Verzenden…
          </>
        ) : (
          <>
            <IconMail className="h-4 w-4" />
            Mail mij dit rapport
          </>
        )}
      </button>
      {status === 'error' && (
        <p className="text-center text-xs text-red-400">
          Verzenden mislukt — probeer het opnieuw.
        </p>
      )}
    </div>
  );
}
