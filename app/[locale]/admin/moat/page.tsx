'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MoatSpinePayload } from '@/lib/moat/types';

export default function MoatAdminPage() {
  const [data, setData] = useState<MoatSpinePayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/moat');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Laden mislukt');
        setData(null);
        return;
      }
      setData(json as MoatSpinePayload);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch('/api/admin/moat', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Refresh mislukt');
        return;
      }
      await load();
    } catch {
      setError('Refresh mislukt');
    } finally {
      setRefreshing(false);
    }
  }

  const m = data?.moatIndex;

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
              Sprint 1 — Data spine
            </p>
            <h1 className="font-condensed mt-1 text-3xl font-black">Moat visibility</h1>
            <p className="mt-2 max-w-xl text-sm text-white/50">
              Bron van waarheid voor voorspellingsfouten, regionale confidence en empirische blend.
              Geen fancy board-UI — wel directeur-taal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg border border-[#E8761A]/40 px-4 py-2 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/10 disabled:opacity-50"
          >
            {refreshing ? 'Herberekenen…' : 'Herbereken signatures'}
          </button>
        </div>

        {loading && <p className="text-sm text-white/40">Laden…</p>}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {data?.notes?.length ? (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {data.notes.map(n => <p key={n}>{n}</p>)}
          </div>
        ) : null}

        {m && (
          <section className="mb-8 rounded-2xl border border-white/8 bg-[#111] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Moat Index</p>
            <p className="font-condensed mt-2 text-5xl font-black text-[#E8761A]">
              {Number(m.moat_index_0_to_10).toFixed(1)}
              <span className="text-2xl text-white/30"> / 10</span>
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-white/40">Volume</p>
                <p className="font-semibold">{m.total_measurements} / {m.target_measurements}</p>
              </div>
              <div>
                <p className="text-white/40">Avg confidence</p>
                <p className="font-semibold">{(Number(m.avg_confidence) * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-white/40">Empirical %</p>
                <p className="font-semibold">{Number(m.avg_empirical_percentage).toFixed(0)}%</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-white/30">
              {m.strong_regions}/{m.region_count} regio’s sellable (≥70%) · {data.signatureCount} signatures
            </p>
          </section>
        )}

        {data && data.geographic.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold">Geographic strength</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-white/35">
                  <tr>
                    <th className="px-4 py-3">Regio</th>
                    <th className="px-4 py-3">Bodem</th>
                    <th className="px-4 py-3">n</th>
                    <th className="px-4 py-3">Conf.</th>
                    <th className="px-4 py-3">Fout%</th>
                    <th className="px-4 py-3">Emp%</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.geographic.map(r => (
                    <tr key={`${r.region_name}-${r.soil_type}`}>
                      <td className="px-4 py-2.5 font-medium">{r.region_name}</td>
                      <td className="px-4 py-2.5 text-white/60">{r.soil_type}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.measurement_count}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {r.confidence_score != null ? `${(Number(r.confidence_score) * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {r.avg_prediction_error_pct != null ? Number(r.avg_prediction_error_pct).toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {r.empirical_percentage != null ? Number(r.empirical_percentage).toFixed(0) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/70">{r.readiness_status}</td>
                      <td className="px-4 py-2.5 text-xs text-[#E8761A]">{r.pricing_tier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {data && data.growth.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold">Growth trajectory</h2>
            </div>
            <ul className="divide-y divide-white/5 px-6">
              {data.growth.slice(0, 12).map(g => (
                <li key={g.month} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-white/60">
                    {new Date(g.month).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                  </span>
                  <span className="tabular-nums text-white">
                    +{g.measurements_this_month} · cum {g.cumulative_total}
                  </span>
                  <span className="text-xs text-white/40">{g.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && (
          <p className="text-[11px] text-white/25">
            Laatst opgevraagd: {new Date(data.queriedAt).toLocaleString('nl-NL')} · zie docs/moat-data-dictionary.md
          </p>
        )}
      </div>
    </div>
  );
}
