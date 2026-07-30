'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

interface ShadowPayload {
  summary: {
    unresolved: number;
    resolved: number;
    meanRelativeError: number | null;
    meanAbsoluteError: number | null;
    withL2: number;
    withL3: number;
    withL4: number;
  };
  recentResolved: Array<{
    id: string;
    href: string | null;
    posterior_mu: number | null;
    actual_rho: number | null;
    relative_error: number | null;
    feat_bro_source: string | null;
    created_at: string | null;
  }>;
  recentUnresolved: Array<{
    id: string;
    href: string | null;
    posterior_mu: number | null;
    l2_n: number | null;
    l3_n: number | null;
    l4_n: number | null;
    feat_bro_source: string | null;
    created_at: string | null;
  }>;
  note: string;
  queriedAt: string;
}

export default function MoatShadowPage() {
  const [data, setData] = useState<ShadowPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/moat/shadow');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Laden mislukt');
        return;
      }
      setData(json as ShadowPayload);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <Link href="/admin/moat" className="hover:text-[#E8761A]">Directeur</Link>
          <span>/</span>
          <span className="text-white/70">Shadow (Poort 2)</span>
          <span className="text-white/20">·</span>
          <Link href="/admin/moat/ops" className="hover:text-[#E8761A]">Ops</Link>
        </div>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-condensed text-3xl font-black">Shadow metrics</h1>
            <p className="mt-2 max-w-xl text-sm text-white/50">{PRODUCT_AVAILABILITY_LINE}</p>
            <p className="mt-1 max-w-xl text-xs text-white/35">
              {data?.note ?? 'Poort-2 review over shadow_predictions (actual_rho).'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
          >
            Vernieuwen
          </button>
        </div>

        {loading && <p className="text-sm text-white/40">Laden…</p>}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {s && (
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-[#111] px-5 py-4">
              <p className="text-[11px] uppercase tracking-widest text-white/30">Met ground truth</p>
              <p className="mt-1 font-condensed text-3xl font-black text-[#E8761A]">{s.resolved}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#111] px-5 py-4">
              <p className="text-[11px] uppercase tracking-widest text-white/30">Unresolved</p>
              <p className="mt-1 font-condensed text-3xl font-black">{s.unresolved}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#111] px-5 py-4">
              <p className="text-[11px] uppercase tracking-widest text-white/30">Mean rel. error</p>
              <p className="mt-1 font-condensed text-3xl font-black">
                {s.meanRelativeError != null
                  ? `${(s.meanRelativeError * 100).toFixed(1)}%`
                  : '—'}
              </p>
            </div>
          </section>
        )}

        {s && (
          <p className="mb-6 text-xs text-white/40">
            Resolved met L2: {s.withL2} · L3: {s.withL3} · L4: {s.withL4}
            {s.meanAbsoluteError != null
              && ` · mean |Δρ| ${s.meanAbsoluteError.toFixed(1)} Ω·m`}
          </p>
        )}

        {data && data.recentResolved.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold">Recent resolved</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-white/35">
                  <tr>
                    <th className="px-4 py-3">Posterior μ</th>
                    <th className="px-4 py-3">Actual ρ</th>
                    <th className="px-4 py-3">Rel. err</th>
                    <th className="px-4 py-3">BRO</th>
                    <th className="px-4 py-3">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.recentResolved.map(r => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 tabular-nums">
                        {r.posterior_mu != null ? r.posterior_mu.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {r.actual_rho != null ? r.actual_rho.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {r.relative_error != null
                          ? `${(r.relative_error * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/50">
                        {r.feat_bro_source ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {r.href ? (
                          <Link href={r.href} className="text-[#E8761A] hover:underline" target="_blank">
                            open
                          </Link>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {data && data.recentUnresolved.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold">Recent unresolved</h2>
              <p className="mt-1 text-xs text-white/35">Wacht op confirmed meting (actual_rho).</p>
            </div>
            <ul className="divide-y divide-white/5 px-6">
              {data.recentUnresolved.map(r => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="text-white/70">
                    μ {r.posterior_mu != null ? r.posterior_mu.toFixed(1) : '—'}
                    <span className="ml-2 text-[11px] text-white/35">
                      L2 n={r.l2_n ?? 0} · L3 n={r.l3_n ?? 0} · L4 n={r.l4_n ?? 0}
                      {r.feat_bro_source ? ` · ${r.feat_bro_source}` : ''}
                    </span>
                  </span>
                  {r.href && (
                    <Link href={r.href} className="text-xs text-[#E8761A] hover:underline" target="_blank">
                      open calc
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && s?.resolved === 0 && s.unresolved === 0 && (
          <p className="text-sm text-white/45">
            Nog geen shadow_predictions. Draai berekeningen met soil-knowledge shadow logging.
          </p>
        )}

        {data && (
          <p className="text-[11px] text-white/25">
            Snapshot: {new Date(data.queriedAt).toLocaleString('nl-NL')}
          </p>
        )}
      </div>
    </div>
  );
}
