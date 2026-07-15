'use client';

// Dashboard is mobile-first. Keep rows compact; show max 3 items per section on the main
// dashboard. Use archive page for full history.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface CalcItem {
  id: string;
  postcode: string | null;
  rapport_naam: string | null;
  created_at: string;
  metingStatus?: string;
  monteurEmail?: string | null;
  metingSubmittedAt?: string | null;
  metingConfirmedAt?: string | null;
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
  locale:       string;
  calcPhase:    CalcItem[];
  metingPhase:  CalcItem[];
  monteurJobs:  MonteurJob[];
  rapportPhase: RapportItem[];
}

/* ── Date helper ────────────────────────────────────────────────────────────── */

function fmtDate(iso: string, locale: string): string {
  const l = locale === 'nl' ? 'nl-NL' : locale === 'de' ? 'de-DE' : 'en-GB';
  return new Date(iso).toLocaleDateString(l, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Icons ──────────────────────────────────────────────────────────────────── */

function IconEye() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function IconRevoke() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}


/* ── Primitives ─────────────────────────────────────────────────────────────── */

function ActionBtn({
  onClick, title, variant = 'default', children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  variant?: 'default' | 'danger' | 'archive' | 'revoke';
  children: React.ReactNode;
}) {
  const cls =
    variant === 'danger'  ? 'text-white/25 hover:bg-red-500/12 hover:text-red-400' :
    variant === 'archive' ? 'text-white/25 hover:bg-[#E8761A]/12 hover:text-[#E8761A]' :
    variant === 'revoke'  ? 'text-white/25 hover:bg-yellow-500/12 hover:text-yellow-400' :
                            'text-white/25 hover:bg-white/6 hover:text-white/70';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }) {
  const cls =
    tone === 'brand'   ? 'border-brand/45 text-brand' :
    tone === 'success' ? 'border-emerald-500/40 text-emerald-400' :
    tone === 'warning' ? 'border-amber-500/40 text-amber-400' :
    tone === 'danger'  ? 'border-red-500/40 text-red-400' :
                         'border-white/25 text-white/50';
  return (
    <span className={`inline-block border-l-2 pl-1.5 text-[10px] font-medium leading-tight ${cls}`}>
      {label}
    </span>
  );
}

function DashboardMeta({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[11px] leading-tight text-white/30 truncate">{children}</p>;
}

function EmptyRow({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="px-4 py-5 text-center">
      <p className="text-sm text-white/30">{text}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/20">{sub}</p>}
    </div>
  );
}

function DashboardMoreLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="border-t border-white/5 px-4 py-2">
      <Link
        href={href}
        className="block text-center text-[11px] font-semibold text-[#E8761A]/70 hover:text-[#E8761A] transition-colors"
      >
        {label}
      </Link>
    </div>
  );
}

function SectionHeader({
  step, title, subtitle, action,
}: {
  step: string; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/6 px-4 py-3">
      <span className="font-mono text-[10px] font-bold text-[#E8761A]/50 shrink-0 w-5">{step}</span>
      <div className="flex-1 min-w-0">
        <h2 className="font-condensed text-sm font-bold text-white leading-tight">{title}</h2>
        <p className="text-[10px] text-white/30 mt-px">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

const MAX = 3;

export function DashboardSections({ locale, calcPhase, metingPhase, monteurJobs, rapportPhase }: Props) {
  const t      = useTranslations('dashboard');
  const l      = useLocale();
  const router = useRouter();

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; naam: string } | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deletedIds,   setDeletedIds]   = useState<Set<string>>(new Set());
  const [deleteError,  setDeleteError]  = useState('');

  // Archive state
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; naam: string; apiPath: string } | null>(null);
  const [archivingId,   setArchivingId]   = useState<string | null>(null);
  const [archivedIds,   setArchivedIds]   = useState<Set<string>>(new Set());
  const [archiveError,  setArchiveError]  = useState('');

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; naam: string } | null>(null);
  const [revokingId,   setRevokingId]   = useState<string | null>(null);
  const [revokedIds,   setRevokedIds]   = useState<Set<string>>(new Set());
  const [revokeError,  setRevokeError]  = useState('');

  // Rename state
  const [renameTarget, setRenameTarget] = useState<{ id: string; naam: string } | null>(null);
  const [renameValue,  setRenameValue]  = useState('');
  const [renaming,     setRenaming]     = useState(false);
  const [renameError,  setRenameError]  = useState('');

  const archivePath = `/${locale}/dashboard/archief`;

  /* ── Handlers ─────────────────────────────────────────────────────────────── */

  function openDelete(e: React.MouseEvent, id: string, naam: string) {
    e.preventDefault(); setDeleteTarget({ id, naam }); setDeleteError('');
  }

  function openArchive(e: React.MouseEvent, id: string, naam: string, apiPath: string) {
    e.preventDefault(); setArchiveTarget({ id, naam, apiPath }); setArchiveError('');
  }

  function openRevoke(e: React.MouseEvent, id: string, naam: string) {
    e.preventDefault(); setRevokeTarget({ id, naam }); setRevokeError('');
  }

  function openRename(e: React.MouseEvent, id: string, naam: string) {
    e.preventDefault(); setRenameTarget({ id, naam }); setRenameValue(naam); setRenameError('');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id); setDeleteError('');
    try {
      const res  = await fetch(`/api/calculations/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setDeleteError(data.error ?? 'Verwijderen mislukt'); return; }
      setDeletedIds(prev => { const s = new Set(Array.from(prev)); s.add(deleteTarget.id); return s; });
      setDeleteTarget(null);
    } catch { setDeleteError(t('modal.connectionError')); }
    finally   { setDeletingId(null); }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchivingId(archiveTarget.id); setArchiveError('');
    try {
      const res  = await fetch(archiveTarget.apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: false }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setArchiveError(data.error ?? 'Archiveren mislukt'); return; }
      setArchivedIds(prev => { const s = new Set(Array.from(prev)); s.add(archiveTarget.id); return s; });
      setArchiveTarget(null);
    } catch { setArchiveError(t('modal.connectionError')); }
    finally   { setArchivingId(null); }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevokingId(revokeTarget.id); setRevokeError('');
    try {
      const res  = await fetch(`/api/meting/${revokeTarget.id}/revoke`, { method: 'PATCH' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setRevokeError(data.error ?? 'Intrekken mislukt'); return; }
      setRevokedIds(prev => { const s = new Set(Array.from(prev)); s.add(revokeTarget.id); return s; });
      setRevokeTarget(null);
      router.refresh();
    } catch { setRevokeError(t('modal.connectionError')); }
    finally   { setRevokingId(null); }
  }

  async function confirmRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true); setRenameError('');
    try {
      const res  = await fetch(`/api/calculations/${renameTarget.id}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapport_naam: renameValue.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setRenameError(data.error ?? 'Opslaan mislukt'); return; }
      setRenameTarget(null);
      router.refresh();
    } catch { setRenameError(t('modal.connectionError')); }
    finally   { setRenaming(false); }
  }

  /* ── Derived lists (client-side exclusions + limit) ───────────────────────── */

  const visibleCalc    = calcPhase  .filter(c => !deletedIds.has(c.id) && !archivedIds.has(c.id));
  const visibleMeting  = metingPhase.filter(c => !deletedIds.has(c.id) && !archivedIds.has(c.id) && !revokedIds.has(c.id));
  const visibleRapport = rapportPhase.filter(r => !archivedIds.has(r.id));

  const displayCalc    = visibleCalc.slice(0, MAX);
  const hasMoreCalc    = visibleCalc.length > MAX;

  const allMetingRows  = [...visibleMeting, ...monteurJobs];
  const displayMeting  = allMetingRows.slice(0, MAX);
  const hasMoreMeting  = allMetingRows.length > MAX;

  const displayRapport = visibleRapport.slice(0, MAX);
  const hasMoreRapport = visibleRapport.length > MAX;

  /* ── Row renderers ─────────────────────────────────────────────────────────── */

  function CalcRow({ calc }: { calc: CalcItem }) {
    const naam = calc.rapport_naam ?? calc.postcode ?? 'Geen postcode';
    return (
      <li className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 last:border-0">
        <Link href={`/pendiepte-rapport/${calc.id}`} className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{naam}</p>
          <DashboardMeta>{t('date.createdAt')} {fmtDate(calc.created_at, l)}</DashboardMeta>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(`/pendiepte-rapport/${calc.id}`); }} title={t('actions.open')}>
            <IconEye />
          </ActionBtn>
          <ActionBtn onClick={e => openRename(e, calc.id, naam)} title={t('actions.rename')}>
            <IconPencil />
          </ActionBtn>
          <ActionBtn onClick={e => openDelete(e, calc.id, naam)} title={t('actions.delete')} variant="danger">
            <IconTrash />
          </ActionBtn>
        </div>
      </li>
    );
  }

  function MetingRow({ calc }: { calc: CalcItem }) {
    const naam        = calc.rapport_naam ?? calc.postcode ?? 'Geen postcode';
    const isSubmitted = calc.metingStatus === 'submitted';
    const dateLabel   = isSubmitted && calc.metingSubmittedAt
      ? `${t('date.submittedAt')} ${fmtDate(calc.metingSubmittedAt, l)}`
      : `${t('date.createdAt')} ${fmtDate(calc.created_at, l)}`;
    return (
      <li className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 last:border-0">
        <Link href={`/pendiepte-rapport/${calc.id}`} className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1 mb-0.5">
            <Badge
              label={isSubmitted ? t('status.submitted') : t('status.invited')}
              tone={isSubmitted ? 'warning' : 'neutral'}
            />
            {isSubmitted && (
              <Badge label={t('status.actionRequired')} tone="warning" />
            )}
          </div>
          <p className="text-sm font-semibold text-white truncate leading-tight">{naam}</p>
          <DashboardMeta>{dateLabel}</DashboardMeta>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(`/pendiepte-rapport/${calc.id}`); }} title={t('actions.open')}>
            <IconEye />
          </ActionBtn>
          {!isSubmitted && (
            <ActionBtn onClick={e => openRevoke(e, calc.id, naam)} title={t('actions.revoke')} variant="revoke">
              <IconRevoke />
            </ActionBtn>
          )}
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
      <li className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 last:border-0">
        <Link href={href} className="flex-1 min-w-0">
          <div className="mb-0.5">
            <Badge label={t('status.yourMeasurement')} tone="brand" />
          </div>
          <p className="text-sm font-semibold text-white truncate leading-tight">{location}</p>
          <DashboardMeta>{fmtDate(job.created_at, l)}</DashboardMeta>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(href); }} title={t('actions.open')}>
            <IconEye />
          </ActionBtn>
        </div>
      </li>
    );
  }

  function RapportRow({ r }: { r: RapportItem }) {
    const isFinished = r.status === 'confirmed' || r.status === 'ondertekend';
    const statusLabel =
      r.status === 'confirmed'   ? t('status.confirmed') :
      r.status === 'ondertekend' ? t('status.ondertekend') :
                                   t('status.concept');
    const apiPath = r.type === 'pendiepte'
      ? `/api/calculations/${r.id}/archive`
      : `/api/rapport/${r.id}/archive`;
    return (
      <li className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 last:border-0">
        <Link href={r.href} className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1 mb-0.5">
            <Badge
              label={statusLabel}
              tone={isFinished ? 'success' : 'warning'}
            />
            <Badge
              label={r.type === 'pendiepte' ? 'Pendiepte' : 'NEN 1010'}
              tone="neutral"
            />
            {r.label && (
              <Badge label={r.label} tone="neutral" />
            )}
          </div>
          <p className="text-sm font-semibold text-white truncate leading-tight">{r.naam}</p>
          <DashboardMeta>{t('date.updatedAt')} {fmtDate(r.created_at, l)}</DashboardMeta>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0">
          <ActionBtn onClick={e => { e.preventDefault(); router.push(r.href); }} title={t('actions.open')}>
            <IconEye />
          </ActionBtn>
          {isFinished ? (
            <ActionBtn
              onClick={e => openArchive(e, r.id, r.naam, apiPath)}
              title={t('actions.archive')}
              variant="archive"
            >
              <IconArchive />
            </ActionBtn>
          ) : (
            <ActionBtn
              onClick={e => openArchive(e, r.id, r.naam, apiPath)}
              title={t('actions.archive')}
              variant="archive"
            >
              <IconArchive />
            </ActionBtn>
          )}
        </div>
      </li>
    );
  }

  /* ── Section helper to render a row, handling the union type ─────────────── */

  function renderMetingRow(item: CalcItem | MonteurJob) {
    if ('calculation_id' in item) {
      return <MonteurRow key={item.calculation_id} job={item} />;
    }
    return <MetingRow key={item.id} calc={item} />;
  }

  /* ── Render ────────────────────────────────────────────────────────────────── */

  return (
    <>
      {/* 01 Berekeningen */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader step="01" title={t('sections.calculations')} subtitle={t('sections.calculationsSubtitle')} />
        {displayCalc.length === 0
          ? <EmptyRow text={t('empty.noCalculations')} sub={t('empty.noCalculationsSub')} />
          : <ul>{displayCalc.map(c => <CalcRow key={c.id} calc={c} />)}</ul>
        }
        {hasMoreCalc && <DashboardMoreLink href={archivePath} label={t('more')} />}
      </div>

      <div className="h-2" aria-hidden />

      {/* 02 Veldmetingen */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader step="02" title={t('sections.measurements')} subtitle={t('sections.measurementsSubtitle')} />
        {displayMeting.length === 0
          ? <EmptyRow text={t('empty.noMeasurements')} sub={t('empty.noMeasurementsSub')} />
          : <ul>{displayMeting.map(item => renderMetingRow(item))}</ul>
        }
        {hasMoreMeting && <DashboardMoreLink href={archivePath} label={t('more')} />}
      </div>

      <div className="h-2" aria-hidden />

      {/* 03 Opleverrapporten */}
      <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden">
        <SectionHeader
          step="03"
          title={t('sections.reports')}
          subtitle={t('sections.reportsSubtitle')}
          action={
            <div className="flex shrink-0 gap-2">
              <Link
                href="/opleverrapport"
                className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-white/60 hover:border-white/30 hover:text-white transition-colors"
              >
                Pendiepte
              </Link>
              <Link
                href="/rapport/nieuw"
                className="rounded-lg border border-[#E8761A]/30 px-2 py-1 text-[10px] font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
              >
                {t('modal.newReport')}
              </Link>
            </div>
          }
        />
        {displayRapport.length === 0
          ? <EmptyRow text={t('empty.noReports')} sub={t('empty.noReportsSub')} />
          : <ul>{displayRapport.map(r => <RapportRow key={r.id} r={r} />)}</ul>
        }
        {hasMoreRapport && <DashboardMoreLink href={archivePath} label={t('more')} />}
      </div>

      {/* ── Rename modal ─────────────────────────────────────────────────────── */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={confirmRename}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 shadow-2xl"
          >
            <h3 className="mb-3 text-base font-bold text-white">{t('modal.renameTitle')}</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-[#E8761A] focus:outline-none mb-3"
            />
            {renameError && <p className="mb-3 text-xs text-red-400">{renameError}</p>}
            <div className="flex gap-2.5">
              <button
                type="submit"
                disabled={renaming || !renameValue.trim()}
                className="flex-1 rounded-xl bg-[#E8761A] py-2.5 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
              >
                {renaming ? t('modal.renameSaving') : t('modal.renameSave')}
              </button>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/60 hover:text-white transition-colors"
              >
                {t('modal.renameCancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Archive modal ─────────────────────────────────────────────────────── */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 shadow-2xl">
            <h3 className="mb-2 text-base font-bold text-white">{t('modal.archiveTitle')}</h3>
            <p className="text-sm text-white/60 leading-relaxed mb-4">
              {t('modal.archiveBody').replace('{naam}', archiveTarget.naam)}
            </p>
            {archiveError && (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {archiveError}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setArchiveTarget(null); setArchiveError(''); }}
                disabled={!!archivingId}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/60 hover:text-white disabled:opacity-50 transition-colors"
              >
                {t('modal.archiveCancel')}
              </button>
              <button
                onClick={confirmArchive}
                disabled={!!archivingId}
                className="flex-1 rounded-xl bg-[#E8761A] py-2.5 text-sm font-bold text-white hover:bg-[#d06510] disabled:opacity-50 transition-colors"
              >
                {archivingId ? '…' : t('modal.archiveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revoke modal ─────────────────────────────────────────────────────── */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 shadow-2xl">
            <h3 className="mb-2 text-base font-bold text-white">{t('modal.revokeTitle')}</h3>
            <p className="text-sm text-white/60 leading-relaxed mb-4">
              {t('modal.revokeBody').replace('{naam}', revokeTarget.naam)}
            </p>
            {revokeError && (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {revokeError}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setRevokeTarget(null); setRevokeError(''); }}
                disabled={!!revokingId}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/60 hover:text-white disabled:opacity-50 transition-colors"
              >
                {t('modal.revokeCancel')}
              </button>
              <button
                onClick={confirmRevoke}
                disabled={!!revokingId}
                className="flex-1 rounded-xl bg-yellow-600 py-2.5 text-sm font-bold text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                {revokingId ? '…' : t('modal.revokeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal ──────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 shadow-2xl">
            <h3 className="mb-2 text-base font-bold text-white">{t('modal.deleteTitle')}</h3>
            <p className="text-sm text-white/60 leading-relaxed mb-4">
              {t('modal.deleteBody').replace('{naam}', deleteTarget.naam)}
            </p>
            {deleteError && (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {t('modal.deleteCancel')}
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deletingId ? '…' : t('modal.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
