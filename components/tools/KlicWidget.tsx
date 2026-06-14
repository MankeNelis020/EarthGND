'use client';

import { useState, useEffect } from 'react';
import { KlicForm } from './KlicForm';

interface KlicMelding {
  id: string;
  meldingsnummer: string;
  melddatum: string | null;
  geldig_tot: string | null;
  graaf_adres: string | null;
  graaf_postcode: string | null;
  netbeheerders: string[];
  utiliteiten: Record<string, boolean>;
  diepste_kabel_m: number | null;
  veilig_graven: boolean;
  opmerkingen: string | null;
  created_at: string;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function GeldigBadge({ geldigTot }: { geldigTot: string | null }) {
  const days = daysUntil(geldigTot);
  if (days === null) return null;
  if (days < 0) return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Verlopen</span>;
  if (days <= 2) return <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400">Nog {days}d</span>;
  return <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Geldig t/m {geldigTot}</span>;
}

interface KlicWidgetProps {
  rapportId: string;
  initialKlicId?: string | null;
}

export function KlicWidget({ rapportId, initialKlicId }: KlicWidgetProps) {
  const [mode, setMode] = useState<'view' | 'new' | 'list'>('view');
  const [linked, setLinked] = useState<KlicMelding | null>(null);
  const [all, setAll] = useState<KlicMelding[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadLinked(id: string) {
    const res = await fetch(`/api/klic?rapport_id=${rapportId}`);
    if (res.ok) {
      const data: KlicMelding[] = await res.json();
      setLinked(data.find(k => k.id === id) ?? null);
    }
  }

  useEffect(() => {
    if (initialKlicId) {
      loadLinked(initialKlicId).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKlicId]);

  async function loadAll() {
    const res = await fetch('/api/klic');
    if (res.ok) setAll(await res.json());
    setMode('list');
  }

  async function linkExisting(klicId: string) {
    await fetch(`/api/klic?id=${klicId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rapport_id: rapportId }),
    });
    const found = all.find(k => k.id === klicId);
    if (found) setLinked(found);
    setMode('view');
  }

  if (loading) return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 animate-pulse h-24" />
  );

  // New form mode
  if (mode === 'new') return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="border-b border-zinc-800 px-5 py-3">
        <p className="text-sm font-semibold text-white">Nieuwe KLIC-melding</p>
      </div>
      <KlicForm
        rapportId={rapportId}
        onSaved={async (id) => { await loadLinked(id); setMode('view'); }}
        onCancel={() => setMode('view')}
      />
    </div>
  );

  // List / pick existing
  if (mode === 'list') return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="flex items-center border-b border-zinc-800 px-5 py-3">
        <p className="flex-1 text-sm font-semibold text-white">Kies een KLIC-melding</p>
        <button onClick={() => setMode('view')} className="text-xs text-white/40 hover:text-white/70">Sluiten</button>
      </div>
      <div className="divide-y divide-zinc-800">
        {all.length === 0 && (
          <p className="px-5 py-6 text-sm text-white/40 text-center">Geen eerdere KLIC-meldingen</p>
        )}
        {all.map(k => (
          <button
            key={k.id}
            onClick={() => linkExisting(k.id)}
            className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-white/3 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-semibold text-white">{k.meldingsnummer}</p>
              {k.graaf_adres && <p className="text-xs text-white/40 truncate">{k.graaf_adres}</p>}
            </div>
            <GeldigBadge geldigTot={k.geldig_tot} />
          </button>
        ))}
      </div>
    </div>
  );

  // Linked view
  if (linked) return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
        <span className="text-sm">🔧</span>
        <p className="flex-1 text-sm font-semibold text-white">KLIC-melding</p>
        <GeldigBadge geldigTot={linked.geldig_tot} />
      </div>
      <div className="px-5 py-4 space-y-3">
        <div>
          <p className="text-xs text-white/40">Meldingsnummer</p>
          <p className="font-mono text-sm font-bold text-white">{linked.meldingsnummer}</p>
        </div>
        {linked.graaf_adres && (
          <div>
            <p className="text-xs text-white/40">Graaflocatie</p>
            <p className="text-sm text-white">{linked.graaf_adres}{linked.graaf_postcode ? `, ${linked.graaf_postcode}` : ''}</p>
          </div>
        )}
        {linked.netbeheerders.length > 0 && (
          <div>
            <p className="text-xs text-white/40">Netbeheerders</p>
            <p className="text-sm text-white">{linked.netbeheerders.join(' · ')}</p>
          </div>
        )}
        {Object.entries(linked.utiliteiten).filter(([, v]) => v).length > 0 && (
          <div>
            <p className="text-xs text-white/40">Aangetroffen kabels/leidingen</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(linked.utiliteiten).filter(([, v]) => v).map(([k]) => (
                <span key={k} className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs capitalize text-white/70">{k}</span>
              ))}
            </div>
          </div>
        )}
        {linked.diepste_kabel_m != null && (
          <div>
            <p className="text-xs text-white/40">Diepste kabel</p>
            <p className="text-sm text-white">{linked.diepste_kabel_m} m</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${linked.veilig_graven ? 'bg-green-500' : 'bg-red-400'}`} />
          <p className="text-sm text-white/70">
            Veilig graven: {linked.veilig_graven ? 'Ja' : 'Nee'}
          </p>
        </div>
        {linked.opmerkingen && (
          <p className="text-xs text-white/50 italic">{linked.opmerkingen}</p>
        )}
      </div>
      <div className="border-t border-zinc-800 px-5 py-3 flex gap-2">
        <button
          onClick={() => { setMode('new'); }}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          + Nieuwe melding
        </button>
        <span className="text-white/20">·</span>
        <button
          onClick={loadAll}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Andere kiezen
        </button>
      </div>
    </div>
  );

  // No KLIC linked yet
  return (
    <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">🔧</span>
        <div>
          <p className="text-sm font-semibold text-white">KLIC-melding</p>
          <p className="text-xs text-white/40">Koppel een graafmelding aan dit rapport</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setMode('new')}
          className="rounded-lg bg-[#E8761A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
        >
          Invoeren
        </button>
        <button
          onClick={loadAll}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white/50 hover:border-zinc-500 transition-colors"
        >
          Bestaande kiezen
        </button>
      </div>
    </div>
  );
}
