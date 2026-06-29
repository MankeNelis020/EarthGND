'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SavedColleague } from '@/lib/colleagues';
import { colleagueDisplayLabel, isValidColleagueEmail, normalizeColleagueEmail } from '@/lib/colleagues';

export function ColleaguesSection() {
  const [colleagues, setColleagues] = useState<SavedColleague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/colleagues');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Laden mislukt');
      setColleagues(data.colleagues ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeColleagueEmail(email);
    if (!isValidColleagueEmail(normalized)) {
      setError('Voer een geldig e-mailadres in.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/colleagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: normalized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt');
      setName('');
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/colleagues/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Verwijderen mislukt');
      }
      setColleagues(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt');
    }
  }

  return (
    <div className="panel mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-white/90">Mijn collega&apos;s</p>
          <p className="mt-0.5 text-xs text-white/45">
            Snel kiezen bij &ldquo;Mail monteur&rdquo; in de Pendiepte Calculator
          </p>
        </div>
        <span className="text-xs text-white/35">{colleagues.length}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3">
          {loading ? (
            <p className="text-xs text-white/40">Laden…</p>
          ) : colleagues.length === 0 ? (
            <p className="mb-3 text-xs text-white/45">
              Nog geen collega&apos;s opgeslagen. Voeg monteurs of vaste contactpersonen toe.
            </p>
          ) : (
            <ul className="mb-3 divide-y divide-white/6 rounded-lg border border-white/8">
              {colleagues.map(c => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/85">
                      {colleagueDisplayLabel(c)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="shrink-0 text-xs text-white/30 hover:text-red-400 transition-colors"
                    title="Verwijderen"
                  >
                    Verwijder
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAdd} className="space-y-2">
            <p className="text-xs font-medium text-white/50">Collega toevoegen</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Naam (optioneel)"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-brand/50 focus:outline-none"
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e-mail@bedrijf.nl"
                required
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-brand/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? 'Opslaan…' : 'Toevoegen'}
            </button>
          </form>

          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
