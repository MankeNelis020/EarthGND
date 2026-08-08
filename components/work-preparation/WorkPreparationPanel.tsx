'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { pushEvent, type EarthGNDLocale } from '@/lib/analytics/gtm';
import type { ProjectReadiness } from '@/lib/work-preparation/types';
import type { PreparationSnapshot } from '@/lib/work-preparation/types';
import { StatusChip } from '@/components/ui/StatusChip';

type Props = {
  calculationId: string;
  initialSnapshot?: PreparationSnapshot | null;
  initialReadiness?: ProjectReadiness | null;
  /** Soft-gate target after override / when ready */
  metingHref?: string;
};

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

function itemTone(status: string): Tone {
  if (status === 'done') return 'success';
  if (status === 'attention') return 'warning';
  if (status === 'na') return 'neutral';
  return 'neutral';
}

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const l = locale === 'nl' ? 'nl-NL' : locale === 'de' ? 'de-DE' : 'en-GB';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString(l, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function WorkPreparationPanel({
  calculationId,
  initialSnapshot = null,
  initialReadiness = null,
  metingHref,
}: Props) {
  const t = useTranslations('workPrep');
  const locale = useLocale();
  const gtmLocale = (locale === 'en' ? 'en' : 'nl') as EarthGNDLocale;

  const [snapshot, setSnapshot] = useState<PreparationSnapshot | null>(initialSnapshot);
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(initialReadiness);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [dateDraft, setDateDraft] = useState(initialSnapshot?.plannedExecutionDate ?? '');
  const [editingDate, setEditingDate] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualRef, setManualRef] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [submitOpen, setSubmitOpen] = useState(false);
  const [locationOk, setLocationOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAck, setOverrideAck] = useState(false);

  const [entitled, setEntitled] = useState(false);
  const [integrationConnected, setIntegrationConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prepRes, intRes] = await Promise.all([
        fetch(`/api/calculations/${calculationId}/preparation`),
        fetch('/api/integrations/klic'),
      ]);
      const prep = await prepRes.json();
      if (prepRes.ok) {
        setSnapshot(prep.snapshot);
        setReadiness(prep.readiness);
        setDateDraft(prep.snapshot?.plannedExecutionDate ?? '');
      }
      if (intRes.ok) {
        const int = await intRes.json();
        setEntitled(!!int.entitled);
        setIntegrationConnected(!!int.integration?.connected);
      }
    } finally {
      setLoading(false);
    }
  }, [calculationId]);

  useEffect(() => {
    if (!initialSnapshot) void load();
    pushEvent('work_preparation_viewed', { calculation_id: calculationId }, gtmLocale);
  }, [calculationId, gtmLocale, initialSnapshot, load]);

  async function patchPrep(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/calculations/${calculationId}/preparation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('errors.generic'));
      setSnapshot(data.snapshot);
      setReadiness(data.readiness);
      if (okMsg) setBanner({ tone: 'ok', text: okMsg });
      return true;
    } catch (e) {
      setBanner({ tone: 'err', text: e instanceof Error ? e.message : t('errors.generic') });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDate() {
    const ok = await patchPrep(
      { plannedExecutionDate: dateDraft || null },
      t('toast.dateUpdated'),
    );
    if (ok) {
      setEditingDate(false);
      pushEvent('execution_date_set', { calculation_id: calculationId }, gtmLocale);
    }
  }

  async function confirmDate() {
    const ok = await patchPrep({ confirmExecutionDate: true }, t('toast.dateConfirmed'));
    if (ok) pushEvent('execution_date_confirmed', { calculation_id: calculationId }, gtmLocale);
  }

  async function markContractor() {
    const ok = await patchPrep(
      { contractorNotificationStatus: 'manually_confirmed' },
      t('toast.contractorMarked'),
    );
    if (ok) pushEvent('contractor_marked_informed', { calculation_id: calculationId }, gtmLocale);
  }

  async function saveManual() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/calculations/${calculationId}/klic/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceNumber: manualRef,
          requestedAt: manualDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('errors.generic'));
      setSnapshot(data.snapshot);
      setReadiness(data.readiness);
      setManualOpen(false);
      setBanner({ tone: 'ok', text: t('toast.klicManual') });
      pushEvent('klic_manual_registered', { calculation_id: calculationId }, gtmLocale);
    } catch (e) {
      setBanner({ tone: 'err', text: e instanceof Error ? e.message : t('errors.generic') });
    } finally {
      setBusy(false);
    }
  }

  async function submitKlic() {
    if (!locationOk) return;
    setSubmitting(true);
    setBanner(null);
    pushEvent('klic_started', { calculation_id: calculationId }, gtmLocale);
    try {
      const res = await fetch(`/api/calculations/${calculationId}/klic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationConfirmed: true,
          geometry: { type: 'unknown', userConfirmed: true },
          idempotencyKey: `ui-${calculationId}-${snapshot?.plannedExecutionDate ?? 'nodate'}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushEvent('klic_submission_failed', { calculation_id: calculationId, code: data.code }, gtmLocale);
        throw new Error(data.error ?? t('errors.klicSubmit'));
      }
      setSnapshot(data.snapshot);
      setReadiness(data.readiness);
      setSubmitOpen(false);
      setBanner({ tone: 'ok', text: t('toast.klicSubmitted') });
      pushEvent('klic_submitted', { calculation_id: calculationId }, gtmLocale);
    } catch (e) {
      setBanner({ tone: 'err', text: e instanceof Error ? e.message : t('errors.klicSubmit') });
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshKlic() {
    setBusy(true);
    try {
      const res = await fetch(`/api/calculations/${calculationId}/klic/refresh`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('errors.generic'));
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.readiness) setReadiness(data.readiness);
    } catch (e) {
      setBanner({ tone: 'err', text: e instanceof Error ? e.message : t('errors.generic') });
    } finally {
      setBusy(false);
    }
  }

  async function confirmOverride() {
    if (!overrideAck) return;
    const ok = await patchPrep(
      { klicOverride: { acknowledge: true } },
      t('toast.override'),
    );
    if (ok) {
      setOverrideOpen(false);
      pushEvent('klic_override_used', { calculation_id: calculationId }, gtmLocale);
      if (metingHref) window.location.href = metingHref;
    }
  }

  function onStartMeting() {
    const klicOk = readiness?.klicReady !== false;
    const policyOn = snapshot?.policyEnabled !== false;
    if (policyOn && !klicOk && !snapshot?.klicOverrideAt) {
      setOverrideOpen(true);
      return;
    }
    if (metingHref) window.location.href = metingHref;
  }

  if (loading || !snapshot || !readiness) {
    return (
      <div className="rounded-2xl border border-white/8 bg-[#111] p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-20 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  const title = snapshot.rapportNaam ?? snapshot.postcode ?? calculationId.slice(0, 8);
  const apiSubmitAvailable = entitled && (integrationConnected || process.env.NEXT_PUBLIC_KLIC_DEV_MOCK === 'true');

  return (
    <div className="flex flex-col gap-5">
      {banner && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.tone === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">
          {t('eyebrow')}
        </p>
        <h1 className="font-condensed mt-1 text-2xl font-black text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-white/45">{title}</p>
      </div>

      {/* Execution date */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
              {t('execution.label')}
            </p>
            {!editingDate ? (
              <p className="mt-1 text-lg font-semibold text-white">
                {snapshot.plannedExecutionDate
                  ? fmtDate(snapshot.plannedExecutionDate, locale)
                  : t('execution.notPlanned')}
              </p>
            ) : (
              <input
                type="date"
                value={dateDraft}
                onChange={e => setDateDraft(e.target.value)}
                className="mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              />
            )}
            {snapshot.executionDateConfirmedAt && snapshot.plannedExecutionDate && (
              <p className="mt-1 text-[11px] text-emerald-400/90">{t('execution.confirmed')}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!editingDate ? (
              <button
                type="button"
                onClick={() => setEditingDate(true)}
                className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-white/30"
              >
                {snapshot.plannedExecutionDate ? t('execution.change') : t('execution.plan')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveDate()}
                  className="min-h-11 rounded-lg bg-[#E8761A] px-4 py-2 text-sm font-semibold text-white"
                >
                  {t('execution.save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDate(false);
                    setDateDraft(snapshot.plannedExecutionDate ?? '');
                  }}
                  className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70"
                >
                  {t('common.cancel')}
                </button>
              </>
            )}
            {snapshot.plannedExecutionDate && !snapshot.executionDateConfirmedAt && !editingDate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDate()}
                className="min-h-11 rounded-lg border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-300"
              >
                {t('execution.confirm')}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Readiness summary */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
              {t('ready.label')}
            </p>
            <p className="mt-1 font-condensed text-xl font-black text-white">
              {readiness.allReady ? t('ready.all') : t('ready.partial', {
                ready: readiness.readyCount,
                total: readiness.totalCount,
              })}
            </p>
          </div>
          <StatusChip
            label={readiness.allReady ? t('ready.badgeOk') : t('ready.badgeOpen')}
            tone={readiness.allReady ? 'success' : 'warning'}
          />
        </div>

        <ul className="mt-5 divide-y divide-white/6">
          {readiness.items.map(item => (
            <li key={item.key} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 text-sm ${
                  item.status === 'done' ? 'text-emerald-400' :
                  item.status === 'attention' ? 'text-amber-400' :
                  item.status === 'na' ? 'text-white/30' :
                  'text-white/35'
                }`}
                aria-hidden
              >
                {item.status === 'done' ? '✓' : item.status === 'attention' ? '!' : item.status === 'na' ? '–' : '○'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">
                  {t(`items.${item.key}` as 'items.calculation')}
                </p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  {t(item.messageKey as 'items.calculationDone')}
                </p>
              </div>
              <StatusChip
                label={
                  item.status === 'done' ? t('status.done') :
                  item.status === 'attention' ? t('status.attention') :
                  item.status === 'na' ? t('status.na') :
                  t('status.pending')
                }
                tone={itemTone(item.status)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Contractor */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          {t('contractor.label')}
        </p>
        <p className="mt-1 text-sm text-white/55">{t('contractor.hint')}</p>
        {readiness.contractorInformed ? (
          <p className="mt-3 text-sm text-emerald-300">{t('contractor.done')}</p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void markContractor()}
            className="mt-4 min-h-11 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/85 hover:border-white/30"
          >
            {t('contractor.markManual')}
          </button>
        )}
      </section>

      {/* KLIC */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
              {t('klic.label')}
            </p>
            {!snapshot.policyEnabled ? (
              <p className="mt-1 text-sm text-white/40">{t('klic.policyOff')}</p>
            ) : (
              <p className="mt-1 text-sm text-white/70">
                {snapshot.klicStatus === 'ready'
                  ? t('klic.ready', { ref: snapshot.klicReferenceNumber ?? '—' })
                  : snapshot.klicStatus === 'attention_required'
                    ? t('klic.dateChanged')
                    : snapshot.klicStatus === 'submitted' || snapshot.klicStatus === 'processing'
                      ? t('klic.processing')
                      : t('klic.none')}
              </p>
            )}
            {snapshot.klicProvider === 'manual' && snapshot.klicStatus === 'ready' && (
              <p className="mt-1 text-[11px] text-white/40">{t('klic.manualNote')}</p>
            )}
          </div>
          {snapshot.policyEnabled && (
            <StatusChip
              label={
                readiness.klic?.level === 'ok' ? t('status.done') :
                readiness.klic?.level === 'urgent' ? t('status.urgent') :
                readiness.klic?.level === 'warning' ? t('status.attention') :
                t('status.pending')
              }
              tone={
                readiness.klic?.level === 'ok' ? 'success' :
                readiness.klic?.level === 'urgent' ? 'danger' :
                readiness.klic?.level === 'warning' ? 'warning' :
                'neutral'
              }
            />
          )}
        </div>

        {snapshot.policyEnabled && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {apiSubmitAvailable && !['ready', 'submitted', 'processing'].includes(snapshot.klicStatus) && (
              <button
                type="button"
                onClick={() => {
                  setSubmitOpen(true);
                  setLocationOk(false);
                }}
                className="min-h-11 rounded-lg bg-[#E8761A] px-4 py-2.5 text-sm font-semibold text-white"
              >
                {t('klic.submitCta')}
              </button>
            )}
            {!apiSubmitAvailable && entitled === false && (
              <Link
                href="/pricing"
                className="inline-flex min-h-11 items-center rounded-lg border border-[#E8761A]/40 px-4 py-2.5 text-sm font-semibold text-[#E8761A]"
              >
                {t('klic.upgradeCta')}
              </Link>
            )}
            {!['ready'].includes(snapshot.klicStatus) && (
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="min-h-11 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80"
              >
                {t('klic.manualCta')}
              </button>
            )}
            {['submitted', 'processing'].includes(snapshot.klicStatus) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshKlic()}
                className="min-h-11 rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/80"
              >
                {t('klic.refresh')}
              </button>
            )}
            <Link
              href="/instellingen#klic"
              className="inline-flex min-h-11 items-center text-sm text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
            >
              {t('klic.settingsLink')}
            </Link>
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-white/35">{t('klic.billingNote')}</p>
      </section>

      {/* Primary CTA */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onStartMeting}
          className="min-h-12 flex-1 rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510]"
        >
          {t('cta.startMeting')}
        </button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/70"
        >
          {t('cta.dashboard')}
        </Link>
      </div>

      {/* Manual KLIC modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="manual-klic-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h2 id="manual-klic-title" className="font-condensed text-xl font-bold text-white">
              {t('manual.title')}
            </h2>
            <p className="mt-1 text-sm text-white/45">{t('manual.subtitle')}</p>
            <label className="mt-4 block text-xs text-white/60">
              {t('manual.ref')}
              <input
                value={manualRef}
                onChange={e => setManualRef(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="mt-3 block text-xs text-white/60">
              {t('manual.date')}
              <input
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setManualOpen(false)} className="min-h-11 rounded-lg px-4 py-2 text-sm text-white/60">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={busy || manualRef.trim().length < 3}
                onClick={() => void saveManual()}
                className="min-h-11 rounded-lg bg-[#E8761A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t('manual.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit KLIC modal */}
      {submitOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="submit-klic-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h2 id="submit-klic-title" className="font-condensed text-xl font-bold text-white">
              {t('submit.title')}
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{t('submit.project')}</dt>
                <dd className="text-right text-white">{title}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{t('submit.date')}</dt>
                <dd className="text-right text-white">{fmtDate(snapshot.plannedExecutionDate, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{t('submit.work')}</dt>
                <dd className="text-right text-white">{t('submit.workValue')}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] text-white/40">{t('klic.billingNote')}</p>
            <label className="mt-4 flex items-start gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={locationOk}
                onChange={e => setLocationOk(e.target.checked)}
                className="mt-1"
              />
              <span>{t('submit.confirmLocation')}</span>
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSubmitOpen(false)} className="min-h-11 rounded-lg px-4 py-2 text-sm text-white/60">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!locationOk || submitting}
                onClick={() => void submitKlic()}
                className="min-h-11 rounded-lg bg-[#E8761A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {submitting ? t('submit.submitting') : t('submit.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soft-gate override */}
      {overrideOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="override-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h2 id="override-title" className="font-condensed text-xl font-bold text-white">
              {t('override.title')}
            </h2>
            <p className="mt-2 text-sm text-white/55">{t('override.body')}</p>
            <label className="mt-4 flex items-start gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={overrideAck}
                onChange={e => setOverrideAck(e.target.checked)}
                className="mt-1"
              />
              <span>{t('override.ack')}</span>
            </label>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setOverrideOpen(false)}
                className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80"
              >
                {t('override.fixKlic')}
              </button>
              <button
                type="button"
                disabled={!overrideAck || busy}
                onClick={() => void confirmOverride()}
                className="min-h-11 rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40"
              >
                {t('override.continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
