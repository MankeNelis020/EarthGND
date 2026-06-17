'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import type { DiepteRapportProps } from '@/components/pdf/DiepteRapportTemplate';

interface Props {
  tool: 'ohm' | 'diepte';
  inputValues: Record<string, string | number>;
  results: Record<string, string | number>;
  warning?: string;
  diepteCalcResult?: DiepteRapportProps;
}

export function EmailRapportButton({ tool, inputValues, results, warning, diepteCalcResult }: Props) {
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
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 5000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  if (status === 'login') {
    return (
      <div className="mt-4 rounded-xl border border-white/15 bg-white/4 p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">Inloggen vereist</p>
        <p className="mb-4 text-xs text-white/60">
          Maak een account aan of log in om dit rapport per e-mail te ontvangen.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/login?redirect=${encodeURIComponent(returnPath)}`}
            className="rounded-lg bg-[#E8761A] px-5 py-2 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
          >
            Inloggen of registreren
          </Link>
          <button
            onClick={() => setStatus('idle')}
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
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
    <div className="mt-4 flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={isBusy || isSent}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors
          ${isSent
            ? 'border-green-500/30 bg-green-500/10 text-green-400 cursor-default'
            : isBusy
            ? 'border-white/10 bg-white/5 text-white/40 cursor-wait'
            : 'border-white/15 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/8 hover:text-white'
          }`}
      >
        {isSent ? (
          <>✓ Mail verzonden</>
        ) : isBusy ? (
          <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />Verzenden…</>
        ) : (
          <>✉ Mail mij dit rapport</>
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
