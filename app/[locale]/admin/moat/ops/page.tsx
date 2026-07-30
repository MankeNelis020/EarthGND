'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

interface OpsPayload {
  funnel: {
    totalOutcomes: number;
    withPredictionLink: number;
    withDepthError: number;
    knowledgeProcessed: number;
    qualityGoed: number;
    qualityTwijfel: number;
    qualityOnbruikbaar: number;
    outliers: number;
  };
  weekly: Array<{ weekStart: string; count: number }>;
  regions: Array<{
    region_name: string;
    soil_type: string;
    measurement_count: number;
    linked_prediction_count: number;
    confidence_score: number | null;
    moat_status: string;
    data_claim_tier: string;
    avg_prediction_error_pct: number | null;
  }>;
  summary: {
    thisWeek: number;
    weeklyTarget: number;
    predictionLinkPct: number;
    knowledgePct: number;
  };
  blockers: Array<{ severity: 'warn' | 'info'; message: string }>;
  queriedAt: string;
}

function FunnelBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-white/70">{label}</span>
        <span className="tabular-nums text-white">{value} <span className="text-white/35">({pct}%)</span></span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-[#E8761A]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MoatOpsPage() {
  const [data, setData] = useState<OpsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/moat/ops');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Laden mislukt');
        return;
      }
      setData(json as OpsPayload);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const f = data?.funnel;
  const s = data?.summary;

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <Link href="/admin/moat" className="hover:text-[#E8761A]">Directeur</Link>
          <span>/</span>
          <Link href="/admin/moat/sales" className="hover:text-[#E8761A]">Sales</Link>
          <span>/</span>
          <span className="text-white/70">Operations</span>
        </div>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-condensed text-3xl font-black">Operations</h1>
            <p className="mt-2 max-w-xl text-sm text-white/50">{PRODUCT_AVAILABILITY_LINE}</p>
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
              <p className="text-[11px] uppercase tracking-widest text-white/30">Deze week</p>
              <p className="mt-1 font-condensed text-3xl font-black text-[#E8761A]">
                {s.thisWeek}<span className="text-lg text-white/30"> / {s.weeklyTarget}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#111] px-5 py-4">
              <p className="text-[11px] uppercase tracking-widest text-white/30">Prediction-link</p>
              <p className="mt-1 font-condensed text-3xl font-black">{s.predictionLinkPct}%</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#111] px-5 py-4">
              <p className="text-[11px] uppercase tracking-widest text-white/30">Knowledge processed</p>
              <p className="mt-1 font-condensed text-3xl font-black">{s.knowledgePct}%</p>
            </div>
          </section>
        )}

        {data?.blockers && data.blockers.length > 0 && (
          <section className="mb-6 space-y-2">
            {data.blockers.map(b => (
              <div
                key={b.message}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  b.severity === 'warn'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                    : 'border-white/10 bg-white/5 text-white/60'
                }`}
              >
                {b.message}
              </div>
            ))}
          </section>
        )}

        {f && (
          <section className="mb-8 rounded-2xl border border-white/8 bg-[#111] p-6">
            <h2 className="font-condensed text-lg font-bold">Data-quality funnel</h2>
            <p className="mt-1 text-xs text-white/40">
              Outcomes → prediction-link → dieptefout → knowledge pipeline
            </p>
            <div className="mt-5 space-y-4">
              <FunnelBar label="Outcomes (confirmed / diepte bekend)" value={f.totalOutcomes} total={f.totalOutcomes} />
              <FunnelBar label="Met prediction-link" value={f.withPredictionLink} total={f.totalOutcomes} />
              <FunnelBar label="Met dieptefout berekend" value={f.withDepthError} total={f.totalOutcomes} />
              <FunnelBar label="Knowledge processed (L2/L3)" value={f.knowledgeProcessed} total={f.totalOutcomes} />
            </div>
            <p className="mt-4 text-[11px] text-white/35">
              Kwaliteit: goed/null {f.qualityGoed} · twijfel {f.qualityTwijfel} · onbruikbaar {f.qualityOnbruikbaar}
              {' · '}outliers {f.outliers}
            </p>
          </section>
        )}

        {data && data.regions.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold">Regionale gezondheid</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-white/35">
                  <tr>
                    <th className="px-4 py-3">Regio</th>
                    <th className="px-4 py-3">n</th>
                    <th className="px-4 py-3">Linked</th>
                    <th className="px-4 py-3">Conf.</th>
                    <th className="px-4 py-3">Moat-status</th>
                    <th className="px-4 py-3">Data-claim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.regions.map(r => (
                    <tr key={`${r.region_name}-${r.soil_type}`}>
                      <td className="px-4 py-2.5 font-medium">
                        {r.region_name}
                        <span className="ml-1 text-[11px] text-white/35">{r.soil_type}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.measurement_count}</td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">{r.linked_prediction_count}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {r.confidence_score != null ? `${(r.confidence_score * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/70">{r.moat_status}</td>
                      <td className="px-4 py-2.5 text-xs text-[#E8761A]">{r.data_claim_tier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {data && data.weekly.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold">Wekelijkse outcomes</h2>
            </div>
            <ul className="divide-y divide-white/5 px-6">
              {data.weekly.map(w => (
                <li key={w.weekStart} className="flex justify-between py-3 text-sm">
                  <span className="text-white/55">
                    week van {new Date(w.weekStart).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="tabular-nums">+{w.count}</span>
                </li>
              ))}
            </ul>
          </section>
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
