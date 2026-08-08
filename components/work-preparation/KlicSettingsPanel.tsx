'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { pushEvent } from '@/lib/analytics/gtm';

type IntegrationView = {
  status: string;
  provider: string;
  providerAccountReference: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  connected: boolean;
};

export function KlicSettingsPanel() {
  const t = useTranslations('workPrep.settings');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [entitled, setEntitled] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [integration, setIntegration] = useState<IntegrationView | null>(null);
  const [bmklEnabled, setBmklEnabled] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableAck, setDisableAck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pol, int] = await Promise.all([
        fetch('/api/profile/klic-policy'),
        fetch('/api/integrations/klic'),
      ]);
      const polData = await pol.json();
      const intData = await int.json();
      if (pol.ok) setEnabled(polData.enabled !== false);
      if (int.ok) {
        setEntitled(!!intData.entitled);
        setCompanyName(intData.companyName ?? null);
        setIntegration(intData.integration);
        setBmklEnabled(!!intData.bmklEnabled);
      }
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  async function setPolicy(next: boolean, acknowledgement?: boolean) {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const res = await fetch('/api/profile/klic-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next, acknowledgement }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('saveError'));
      setEnabled(next);
      setDisableOpen(false);
      setDisableAck(false);
      setOk(next ? t('enabledOk') : t('disabledOk'));
      if (!next) pushEvent('klic_policy_disabled', {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const res = await fetch('/api/integrations/klic/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountReference: companyName ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('saveError'));
      setIntegration(data.integration);
      setOk(data.note ?? t('connectedOk'));
      pushEvent('klic_integration_connected', {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/klic/verify', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('saveError'));
      setIntegration(data.integration);
      setOk(data.ok ? t('verifiedOk') : (data.messageSafe ?? t('verifyFail')));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/klic', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('saveError'));
      setIntegration(data.integration);
      setOk(t('disconnectedOk'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-white/5" />;
  }

  return (
    <div id="klic" className="scroll-mt-8 space-y-5">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}
      {ok && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{ok}</div>
      )}

      {/* Policy */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          {t('policyTitle')}
        </p>
        <p className="mt-2 text-sm text-white/55">{t('policyBody')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`text-sm font-semibold ${enabled ? 'text-emerald-300' : 'text-white/40'}`}>
            {enabled ? t('policyOn') : t('policyOff')}
          </span>
          {enabled ? (
            <button
              type="button"
              onClick={() => { setDisableOpen(true); setDisableAck(false); }}
              className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80"
            >
              {t('disableCta')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void setPolicy(true)}
              className="min-h-11 rounded-lg border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-300"
            >
              {t('enableCta')}
            </button>
          )}
        </div>
      </section>

      {/* Integration */}
      <section className="rounded-2xl border border-white/8 bg-[#111] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          {t('integrationTitle')}
        </p>
        <p className="mt-2 text-sm text-white/55">{t('integrationBody')}</p>

        {!entitled ? (
          <div className="mt-4">
            <p className="text-sm text-amber-200/90">{t('notEntitled')}</p>
            <Link href="/pricing" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#E8761A]">
              {t('upgrade')}
            </Link>
          </div>
        ) : integration?.connected ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-emerald-300">● {t('connected')}</p>
            <p className="text-white/70">{t('org')}: {integration.providerAccountReference ?? companyName ?? '—'}</p>
            {integration.lastVerifiedAt && (
              <p className="text-white/40 text-xs">
                {t('lastChecked')}: {new Date(integration.lastVerifiedAt).toLocaleString()}
              </p>
            )}
            {!bmklEnabled && (
              <p className="text-[11px] text-white/35">{t('bmklPending')}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" disabled={busy} onClick={() => void verify()} className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80">
                {t('verify')}
              </button>
              <button type="button" disabled={busy} onClick={() => void disconnect()} className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm text-white/50">
                {t('disconnect')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-white/50">
              {integration?.status === 'configuration_required' ? t('configRequired') : t('disconnected')}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void connect()}
              className="min-h-11 rounded-lg bg-[#E8761A] px-4 py-2.5 text-sm font-semibold text-white"
            >
              {t('connect')}
            </button>
            <a
              href="https://www.kadaster.nl/zakelijk/producten/kabels-en-leidingen"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-white/45 underline-offset-2 hover:underline"
            >
              {t('openKadaster')} ↗
            </a>
          </div>
        )}
      </section>

      {disableOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h2 className="font-condensed text-xl font-bold text-white">{t('disableTitle')}</h2>
            <p className="mt-2 text-sm text-white/55">{t('disableBody')}</p>
            <label className="mt-4 flex items-start gap-3 text-sm text-white/80">
              <input type="checkbox" checked={disableAck} onChange={e => setDisableAck(e.target.checked)} className="mt-1" />
              <span>{t('disableAck')}</span>
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDisableOpen(false)} className="min-h-11 px-4 py-2 text-sm text-white/60">
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!disableAck || busy}
                onClick={() => void setPolicy(false, true)}
                className="min-h-11 rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40"
              >
                {t('disableConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
