'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface CalcItem {
  id: string;
  postcode: string | null;
  rapport_naam: string | null;
  created_at: string;
  metingStatus?: string;
  monteurEmail?: string | null;
}

export interface MonteurJob {
  calculation_id: string;
  status: string;
  postcode: string | null;
  straatnaam: string | null;
  woonplaats: string | null;
  created_at: string;
}

export interface RapportItem {
  id: string;
  type: 'pendiepte' | 'nen1010';
  label: string;
  status: string;
  naam: string;
  created_at: string;
  href: string;
}

interface Props {
  calcPhase:    CalcItem[];
  metingPhase:  CalcItem[];
  monteurJobs:  MonteurJob[];
  rapportPhase: RapportItem[];
}

/* ── Icons ──────────────────────────────────────────────────────────────────── */

function IconEye() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg className="h-4 w-4 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/* ── Action buttons ─────────────────────────────────────────────────────────── */

function ActionBtn({
  onClick, title, variant = 'default', children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  variant?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        variant === 'danger'
          ? 'text-white/30 hover:bg-red-500/15 hover:text-red-400'
          : 'text-white/30 hover:bg-white/8 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  );
}

/* ── Section chrome ─────────────────────────────────────────────────────────── */

function SectionHeader({
  step, title, subtitle, action,
}: {
  step: string; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-white/6 px-5 py-4">
      <span className="font-mono text-[11px] font-bold text-[#E8761A]/50 shrink-0 w-6">{step}</span>
      <div className="flex-1 min-w-0">
        <h2 className="font-condensed text-sm font-bold uppercase tracking-wide text-white">{title}</h2>
        <p className="text-[11px] text-white/30 mt-0.5">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyRow({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="px-5 py-7 text-center">
      <p className="text-sm text-white/30">{text}</p>
      {sub && <p className="mt-1 text-[11px] text-white/20">{sub}</p>}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-0.5" aria-hidden>
      <div className="flex flex-col gap-[3px]">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-[3px] w-[3px] rounded-full bg-white/12" />
        ))}
      </div>
    </div>
  );
}

/* ── Status badge ───────────────────────────────────────────────────────────── */

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export function DashboardSections({ calcPhase, metingPhase, monteurJobs, rapportPhase }: Props) {
  const router = useRouter();

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; naam: string } | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deletedIds,   setDeletedIds]   = useState<Set<string>>(new Set());
  const [deleteError,  setDeleteError]  = useState('');

  // Rename state
  const [renameTarget, setRenameTarget] = useState<{ id: string; naam: string } | null>(null);
  const [renameValue,  setRenameValue]  = useState('');
  const [renaming,     setRenaming]     = useState(false);
  const [renameError,  setRenameError]  = useState('');

  /* ── Handlers ─────────────────────────────────────────────────────────────── */

  function openDelete(e: React.MouseEvent, id: string, naam: string) {
    e.preventDefault();
    setDeleteTarget({ id, naam });
    setDeleteError('');
  }

  function openRename(e: React.MouseEvent, id: string, naam: string) {
    e.preventDefault();
    setRenameTarget({ id, naam });
    setRenameValue(naam);
    setRenameError('');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError('');
    try {
      const res  = await fetch(`/api/calculations/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? 'Verwijderen mislukt'); return; }
      setDeletedIds(prev => {
        const next = new Set(Array.from(prev));
        next.add(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
    } catch {
      setDeleteError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setDeletingId(null);
    }
  }

  async function confirmRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    setRenameError('');
    try {
      const res  = await fetch(`/api/calculations/${renameTarget.id}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapport_naam: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setRenameError(data.error ?? 'Opslaan mislukt'); return; }
      setRenameTarget(null);
      router.refresh();
    } catch {
      setRenameError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setRenaming(false);
    }
  }

  /* ── Derived lists ─────────────────────────────────────────────────────────── */

  const visibleCalc   = calcPhase.filter(c => !deletedIds.has(c.id));
  const visibleMeting = metingPhase.filter(c => !deletedIds.has(c.id));

  /* ── Row renderers ─────────────────────────────────────────────────────────── */

  function CalcRow({ calc }: { calc: CalcItem }) {
    const naam = calc.rapport_naam ?? calc.postcode ?? 'Geen postcode';
    return (
      <li className="flex items-center gap-2 px-5 py-3 border-b border-white/5 last:border-0">
        <Link
          href={`/pendiepte-rapport/${calc.id}`}
          className="flex-1 min-w-0 flex items-center gap-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{naam}</p>
            <p className="text-[11px] text-white/30 mt-0.5">
              {new Date(calc.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <IconChevron />
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(`/pendiepte-rapport/${calc.id}`); }} title="Bekijken">
            <IconEye />
          </ActionBtn>
          <ActionBtn onClick={e => openRename(e, calc.id, naam)} title="Hernoemen">
            <IconPencil />
          </ActionBtn>
          <ActionBtn onClick={e => openDelete(e, calc.id, naam)} title="Verwijderen" variant="danger">
            <IconTrash />
          </ActionBtn>
        </div>
      </li>
    );
  }

  function MetingRow({ calc }: { calc: CalcItem }) {
    const naam        = calc.rapport_naam ?? calc.postcode ?? 'Geen postcode';
    const isSubmitted = calc.metingStatus === 'submitted';
    return (
      <li className="flex items-center gap-2 px-5 py-3 border-b border-white/5 last:border-0">
        <Link href={`/pendiepte-rapport/${calc.id}`} className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1">
            <Badge
              label={isSubmitted ? 'Ingediend' : 'Uitgenodigd'}
              cls={isSubmitted
                ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400'
                : 'border-blue-500/30 bg-blue-500/5 text-blue-400'}
            />
            {isSubmitted && (
              <Badge label="Actie vereist" cls="border-yellow-500/40 bg-yellow-500/10 text-yellow-300" />
            )}
          </div>
          <p className="text-sm font-semibold text-white truncate">{naam}</p>
          {calc.monteurEmail && (
            <p className="text-[11px] text-white/30 mt-0.5">{calc.monteurEmail}</p>
          )}
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(`/pendiepte-rapport/${calc.id}`); }} title="Bekijken">
            <IconEye />
          </ActionBtn>
        </div>
      </li>
    );
  }

  function MonteurRow({ job }: { job: MonteurJob }) {
    const href     = job.status === 'submitted'
      ? `/pendiepte-rapport/${job.calculation_id}`
      : `/meting/${job.calculation_id}`;
    const location = job.straatnaam ?? job.postcode ?? 'Onbekend adres';
    return (
      <li className="flex items-center gap-2 px-5 py-3 border-b border-white/5 last:border-0">
        <Link href={href} className="flex-1 min-w-0">
          <div className="mb-1">
            <Badge label="Jouw meting" cls="border-[#E8761A]/30 bg-[#E8761A]/8 text-[#E8761A]" />
          </div>
          <p className="text-sm font-semibold text-white truncate">{location}</p>
          <p className="text-[11px] text-white/30 mt-0.5">
            {new Date(job.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
          </p>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(href); }} title="Openen">
            <IconEye />
          </ActionBtn>
        </div>
      </li>
    );
  }

  function RapportRow({ r }: { r: RapportItem }) {
    return (
      <li className="flex items-center gap-2 px-5 py-3 border-b border-white/5 last:border-0">
        <Link href={r.href} className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-0.5">
            <Badge
              label={r.status === 'confirmed' ? 'Bevestigd' : r.status === 'ondertekend' ? 'Ondertekend' : 'Concept'}
              cls={r.status === 'confirmed' || r.status === 'ondertekend'
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-yellow-500/20 bg-yellow-500/8 text-yellow-400'}
            />
            <Badge
              label={r.type === 'pendiepte' ? 'Pendiepte' : 'NEN 1010'}
              cls="border-white/10 bg-white/3 text-white/35"
            />
            {r.label && (
              <Badge label={r.label} cls="border-white/10 bg-white/3 text-white/35" />
            )}
          </div>
          <p className="text-sm font-semibold text-white truncate">{r.naam}</p>
          <p className="text-[11px] text-white/30 mt-0.5">
            {new Date(r.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
          </p>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(r.href); }} title="Bekijken">
            <IconEye />
          </ActionBtn>
        </div>
      </li>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────────── */

  return (
    <>
      {/* 01 Pendiepte berekeningen */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader step="01" title="Berekeningen" subtitle="Pendiepte — nog geen monteur uitgenodigd" />
        {visibleCalc.length === 0
          ? <EmptyRow text="Geen berekeningen" sub="Open de Pendiepte Calculator om te starten" />
          : <ul>{visibleCalc.map(c => <CalcRow key={c.id} calc={c} />)}</ul>
        }
      </div>

      <Connector />

      {/* 02 Veldmetingen */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader step="02" title="Veldmetingen" subtitle="Openstaande en ingediende metingen" />
        {visibleMeting.length === 0 && monteurJobs.length === 0
          ? <EmptyRow text="Geen openstaande veldmetingen" sub="Nodig een monteur uit via de Pendiepte Calculator" />
          : (
            <ul>
              {visibleMeting.map(c => <MetingRow key={c.id} calc={c} />)}
              {monteurJobs.map(j => <MonteurRow key={j.calculation_id} job={j} />)}
            </ul>
          )
        }
      </div>

      <Connector />

      {/* 03 Opleverrapporten */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader
          step="03"
          title="Opleverrapporten"
          subtitle="Bevestigde metingen en NEN 1010"
          action={
            <Link
              href="/rapport/nieuw"
              className="shrink-0 rounded-lg border border-[#E8761A]/30 px-2.5 py-1.5 text-[11px] font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
            >
              + Nieuw
            </Link>
          }
        />
        {rapportPhase.length === 0
          ? <EmptyRow text="Nog geen opleverrapporten" sub="Bevestig een veldmeting of maak een NEN 1010 rapport aan" />
          : <ul>{rapportPhase.map(r => <RapportRow key={r.id} r={r} />)}</ul>
        }
      </div>

      {/* ── Rename modal ─────────────────────────────────────────────────────── */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={confirmRename}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl"
          >
            <h3 className="mb-4 text-base font-bold text-white">Naam wijzigen</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-[#E8761A] focus:outline-none mb-3"
            />
            {renameError && (
              <p className="mb-3 text-xs text-red-400">{renameError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={renaming || !renameValue.trim()}
                className="flex-1 rounded-xl bg-[#E8761A] py-2.5 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
              >
                {renaming ? 'Opslaan…' : 'Opslaan'}
              </button>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/60 hover:text-white transition-colors"
              >
                Annuleer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete modal ──────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
            <h3 className="mb-2 text-base font-bold text-white">Berekening verwijderen</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              Je verwijdert{' '}
              <span className="font-semibold text-white">{deleteTarget.naam}</span>.
              Hierdoor gaan de gegevens verloren.
            </p>
            <p className="mt-1 mb-5 text-sm font-semibold text-white/40">Wil je doorgaan?</p>
            {deleteError && (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Nee, annuleer
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deletingId ? 'Verwijderen…' : 'Ja, verwijder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
