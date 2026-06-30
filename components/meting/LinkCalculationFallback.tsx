'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  locale: string;
}

/** Fallback: open opleverrapport via berekening-UUID when not auto-linked. */
export function LinkCalculationFallback({ locale }: Props) {
  const router = useRouter();
  const [uuid, setUuid] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = uuid.trim();
    if (!trimmed) return;
    setChecking(true);
    setError('');
    try {
      const res = await fetch(`/api/calculations/${trimmed}/access-check`);
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Berekening niet gevonden of geen toegang.');
        return;
      }
      router.push(`/${locale}/pendiepte-rapport/${trimmed}`);
    } catch {
      setError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleLink} className="rounded-xl border border-white/10 bg-white/3 p-5">
      <p className="mb-1 text-sm font-semibold text-white/80">Koppel via berekening-UUID</p>
      <p className="mb-3 text-xs text-white/45 leading-relaxed">
        Staat de veldmeting nog niet gekoppeld? Plak de UUID uit de Pendiepte Calculator
        (zichtbaar na berekenen) om berekening en meetgegevens te laden.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={uuid}
          onChange={e => setUuid(e.target.value)}
          placeholder="bijv. a1b2c3d4-e5f6-…"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={checking || !uuid.trim()}
          className="rounded-lg bg-[#E8761A] px-4 py-2 text-xs font-bold text-white hover:bg-[#d06510] disabled:opacity-50"
        >
          {checking ? 'Controleren…' : 'Open rapport'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
}
