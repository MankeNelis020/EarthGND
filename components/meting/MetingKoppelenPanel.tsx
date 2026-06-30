'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LinkableVeldmeting } from '@/lib/pendiepte-rapport-bridge';

interface Props {
  locale: string;
  /** Highlight the active calculation when already on an opleverrapport page. */
  currentCalculationId?: string;
  /** Compact mode: hide intro when embedded in a larger page. */
  compact?: boolean;
}

type Tab = 'lijst' | 'uuid';

const STATUS_CLS: Record<string, string> = {
  confirmed:   'text-green-400 border-green-500/30 bg-green-500/10',
  submitted:   'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  invited:     'text-blue-400 border-blue-500/30 bg-blue-500/10',
  draft:       'text-white/50 border-white/10 bg-white/5',
  geen_meting: 'text-white/40 border-white/10 bg-white/5',
};

export function MetingKoppelenPanel({ locale, currentCalculationId, compact }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('lijst');
  const [items, setItems] = useState<LinkableVeldmeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [uuid, setUuid] = useState('');
  const [checking, setChecking] = useState(false);
  const [uuidError, setUuidError] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/opleverrapport/linkable');
      const data = await res.json() as { items?: LinkableVeldmeting[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Laden mislukt');
      setItems(data.items ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  function openCalculation(calculationId: string) {
    router.push(`/${locale}/pendiepte-rapport/${calculationId}`);
  }

  async function handleUuidSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = uuid.trim();
    if (!trimmed) return;
    setChecking(true);
    setUuidError('');
    try {
      const res = await fetch(`/api/calculations/${trimmed}/access-check`);
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setUuidError(data.error ?? 'Berekening niet gevonden of geen toegang.');
        return;
      }
      openCalculation(trimmed);
    } catch {
      setUuidError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111] overflow-hidden">
      {!compact && (
        <div className="border-b border-white/8 px-5 py-4">
          <p className="text-sm font-semibold text-white">Welke veldmeting?</p>
          <p className="mt-1 text-xs text-white/45 leading-relaxed">
            Kies een bestaande pendiepte-berekening met veldmeting, of plak de UUID uit de calculator.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/8">
        {([
          { key: 'lijst' as const, label: 'Mijn metingen' },
          { key: 'uuid' as const, label: 'Plak UUID' },
        ]).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === t.key
                ? 'border-b-2 border-[#E8761A] text-[#E8761A]'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'lijst' && (
          <>
            {loading && <p className="text-xs text-white/40">Metingen laden…</p>}
            {loadError && <p className="text-xs text-red-400">{loadError}</p>}

            {!loading && !loadError && items.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                <p className="text-sm text-white/50">Nog geen pendiepte-berekeningen</p>
                <p className="mt-1 text-xs text-white/35">
                  Bereken eerst een pendiepte in de calculator, of plak een UUID.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('uuid')}
                  className="mt-4 text-xs font-semibold text-[#E8761A] hover:underline"
                >
                  UUID plakken →
                </button>
              </div>
            )}

            {!loading && items.length > 0 && (
              <ul className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {items.map(item => {
                  const isCurrent = item.calculation_id === currentCalculationId;
                  const statusCls = STATUS_CLS[item.status] ?? STATUS_CLS.geen_meting;
                  return (
                    <li key={item.calculation_id}>
                      <button
                        type="button"
                        onClick={() => openCalculation(item.calculation_id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                          isCurrent
                            ? 'border-[#E8761A]/40 bg-[#E8761A]/8'
                            : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {item.rapport_naam ?? item.locatie_label}
                            </p>
                            {item.rapport_naam && (
                              <p className="truncate text-xs text-white/45">{item.locatie_label}</p>
                            )}
                            <p className="mt-1 font-mono text-[10px] text-white/30">
                              #{item.short_id}
                              {item.role === 'installateur' && (
                                <span className="ml-2 text-white/25">· als installateur</span>
                              )}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
                            {item.status_label}
                          </span>
                        </div>
                        {isCurrent && (
                          <p className="mt-2 text-[10px] font-semibold text-[#E8761A]">← Huidige selectie</p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'uuid' && (
          <form onSubmit={handleUuidSubmit} className="space-y-3">
            <p className="text-xs text-white/45 leading-relaxed">
              De UUID staat in de Pendiepte Calculator na berekenen, of in de uitnodigingsmail.
              Formaat: <span className="font-mono text-white/60">a1b2c3d4-e5f6-7890-abcd-ef1234567890</span>
            </p>
            <input
              value={uuid}
              onChange={e => setUuid(e.target.value)}
              placeholder="Plak berekening-UUID…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none"
            />
            {uuidError && <p className="text-xs text-red-400">{uuidError}</p>}
            <button
              type="submit"
              disabled={checking || !uuid.trim()}
              className="w-full rounded-lg bg-[#E8761A] py-2.5 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50"
            >
              {checking ? 'Controleren…' : 'Open opleverrapport'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
