'use client';

import { useState } from 'react';
import Link from 'next/link';

interface CalcItem {
  id: string;
  postcode: string | null;
  rapport_naam: string | null;
  created_at: string;
  metingStatus?: string;
  monteurEmail?: string | null;
}

interface MonteurJob {
  calculation_id: string;
  status: string;
  postcode: string | null;
  straatnaam: string | null;
  woonplaats: string | null;
  created_at: string;
}

interface RapportItem {
  id: string;
  type: 'pendiepte' | 'nen1010';
  label: string;
  status: string;
  naam: string;
  created_at: string;
  href: string;
}

interface Props {
  calcPhase:   CalcItem[];
  metingPhase: CalcItem[];
  monteurJobs: MonteurJob[];
  rapportPhase: RapportItem[];
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-4 w-4 shrink-0 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function SectionHeader({
  step, title, subtitle, action,
}: {
  step: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-white/6 px-6 py-4">
      <span className="font-mono text-[11px] font-bold text-[#E8761A]/60 shrink-0">{step}</span>
      <div className="flex-1 min-w-0">
        <h2 className="font-condensed text-base font-bold text-white leading-tight">{title}</h2>
        <p className="text-[11px] text-white/35 mt-0.5">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="px-6 py-8 text-center">
      <p className="text-sm text-white/35">{text}</p>
      {sub && <p className="mt-1 text-xs text-white/20">{sub}</p>}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center my-1" aria-hidden>
      <div className="flex flex-col items-center gap-0.5">
        <div className="h-1.5 w-px bg-white/10" />
        <div className="h-1.5 w-px bg-white/10" />
        <div className="h-1.5 w-px bg-white/10" />
      </div>
    </div>
  );
}

export function DashboardSections({ calcPhase, metingPhase, monteurJobs, rapportPhase }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; naam: string } | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deletedIds,   setDeletedIds]   = useState<Set<string>>(new Set());
  const [deleteError,  setDeleteError]  = useState('');

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError('');
    try {
      const res = await fetch(`/api/calculations/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? 'Verwijderen mislukt'); return; }
      setDeletedIds(prev => new Set([...Array.from(prev), deleteTarget.id]));
      setDeleteTarget(null);
    } catch {
      setDeleteError('Verbindingsfout — probeer opnieuw.');
    } finally {
      setDeletingId(null);
    }
  }

  const visibleCalc    = calcPhase.filter(c => !deletedIds.has(c.id));
  const visibleMeting  = metingPhase.filter(c => !deletedIds.has(c.id));
  const hasVeldmetingen = visibleMeting.length > 0 || monteurJobs.length > 0;

  return (
    <>
      {/* ── 1. Pendiepte berekeningen ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader
          step="01"
          title="Pendiepte berekeningen"
          subtitle="Berekening gereed — nog geen monteur uitgenodigd"
        />
        {visibleCalc.length === 0 ? (
          <EmptyState
            text="Geen berekeningen"
            sub="Open de Pendiepte Calculator om te starten"
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {visibleCalc.map(calc => (
              <li key={calc.id} className="group flex items-center gap-3 px-6 py-3.5 hover:bg-white/3 transition-colors">
                <Link href={`/pendiepte-rapport/${calc.id}`} className="min-w-0 flex-1 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">
                      {calc.rapport_naam ?? calc.postcode ?? 'Geen postcode'}
                    </p>
                    <p className="text-xs text-white/30">
                      {new Date(calc.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <ChevronRight />
                </Link>
                <button
                  onClick={() => setDeleteTarget({ id: calc.id, naam: calc.rapport_naam ?? calc.postcode ?? 'Geen postcode' })}
                  className="shrink-0 p-1.5 rounded-lg text-white/20 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Verwijderen"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Connector />

      {/* ── 2. Veldmetingen ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader
          step="02"
          title="Veldmetingen"
          subtitle="Openstaande en ingediende metingen"
        />
        {!hasVeldmetingen ? (
          <EmptyState
            text="Geen openstaande veldmetingen"
            sub="Nodig een monteur uit via de Pendiepte Calculator"
          />
        ) : (
          <ul className="divide-y divide-white/5">

            {/* Als opdrachtgever */}
            {visibleMeting.map(calc => {
              const isSubmitted = calc.metingStatus === 'submitted';
              return (
                <li key={calc.id}>
                  <Link
                    href={`/pendiepte-rapport/${calc.id}`}
                    className="flex items-center gap-3 px-6 py-3.5 hover:bg-white/3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          isSubmitted
                            ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400'
                            : 'border-blue-500/30 bg-blue-500/5 text-blue-400'
                        }`}>
                          {isSubmitted ? 'Ingediend' : 'Uitgenodigd'}
                        </span>
                        {isSubmitted && (
                          <span className="shrink-0 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                            Actie vereist
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-white truncate">
                        {calc.rapport_naam ?? calc.postcode ?? 'Geen postcode'}
                      </p>
                      {calc.monteurEmail && (
                        <p className="text-xs text-white/30">{calc.monteurEmail}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-white/30">
                      {new Date(calc.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </div>
                    <ChevronRight />
                  </Link>
                </li>
              );
            })}

            {/* Als monteur */}
            {monteurJobs.map(job => {
              const href = job.status === 'submitted'
                ? `/pendiepte-rapport/${job.calculation_id}`
                : `/meting/${job.calculation_id}`;
              const location = [job.straatnaam].filter(Boolean).join(', ') || job.postcode || 'Onbekend adres';
              return (
                <li key={job.calculation_id}>
                  <Link href={href} className="flex items-center gap-3 px-6 py-3.5 hover:bg-white/3 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1">
                        <span className="rounded-full border border-[#E8761A]/30 bg-[#E8761A]/8 px-2 py-0.5 text-[10px] font-bold text-[#E8761A]">
                          Jouw meting
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-white">{location}</p>
                      <p className="text-xs text-white/30">
                        {new Date(job.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <ChevronRight />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Connector />

      {/* ── 3. Opleverrapporten ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader
          step="03"
          title="Opleverrapporten"
          subtitle="Bevestigde metingen en NEN 1010 rapporten"
          action={
            <Link
              href="/rapport/nieuw"
              className="shrink-0 rounded-lg border border-[#E8761A]/30 px-3 py-1.5 text-xs font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
            >
              + NEN 1010
            </Link>
          }
        />
        {rapportPhase.length === 0 ? (
          <EmptyState
            text="Nog geen opleverrapporten"
            sub="Bevestig een veldmeting of maak een NEN 1010 rapport aan"
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {rapportPhase.map(r => (
              <li key={r.id}>
                <Link href={r.href} className="flex items-center gap-3 px-6 py-3.5 hover:bg-white/3 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        r.status === 'confirmed' || r.status === 'ondertekend'
                          ? 'border-green-500/30 bg-green-500/10 text-green-400'
                          : 'border-yellow-500/20 bg-yellow-500/8 text-yellow-400'
                      }`}>
                        {r.status === 'confirmed' ? 'Bevestigd' : r.status === 'ondertekend' ? 'Ondertekend' : 'Concept'}
                      </span>
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/35">
                        {r.type === 'pendiepte' ? 'Pendiepte' : 'NEN 1010'}
                      </span>
                      {r.label && (
                        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/35">
                          {r.label}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-semibold text-white">{r.naam}</p>
                  </div>
                  <div className="shrink-0 text-xs text-white/30">
                    {new Date(r.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </div>
                  <ChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Delete confirmation modal ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
            <h3 className="mb-2 text-base font-bold text-white">Berekening verwijderen</h3>
            <p className="mb-1 text-sm text-white/70">
              Je verwijdert <span className="font-semibold text-white">{deleteTarget.naam}</span>.
              Hierdoor gaan de gegevens definitief verloren.
            </p>
            <p className="mb-6 text-sm font-semibold text-white/50">Wil je doorgaan?</p>
            {deleteError && (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deletingId ? 'Verwijderen…' : 'Ja, verwijder'}
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Nee, annuleer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
