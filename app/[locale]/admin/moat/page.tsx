'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { MoatSpinePayload } from '@/lib/moat/types';
import {
  PRODUCT_AVAILABILITY_LINE,
  dataClaimTierLabel,
  moatReadinessFromConfidence,
  moatReadinessHint,
  moatReadinessLabel,
  normalizeReadinessStatus,
} from '@/lib/moat/labels';

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full bg-[#E8761A] transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function readinessTone(level: ReturnType<typeof moatReadinessFromConfidence>): string {
  switch (level) {
    case 'proven':     return 'text-emerald-400';
    case 'emerging':   return 'text-[#E8761A]';
    case 'collecting': return 'text-amber-300/80';
    case 'thin':       return 'text-white/40';
  }
}

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
  const board = data?.board;
  const claimReady = m?.moat_claim_ready_regions ?? m?.strong_regions ?? 0;

  return (
    <div className="min-h-screen bg-canvas text-white print:bg-white print:text-black">
      <div className="mx-auto max-w-4xl px-4 py-10 print:max-w-none print:px-6 print:py-4">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 print:mb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 print:text-black/50">
              Directeur · Moat dashboard
            </p>
            <h1 className="font-condensed mt-1 text-3xl font-black print:text-black">EarthGND Moat</h1>
            <p className="mt-2 max-w-xl text-sm text-white/50 print:text-black/60">
              {PRODUCT_AVAILABILITY_LINE}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link
              href="/admin/moat/sales"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
            >
              Sales
            </Link>
            <Link
              href="/admin/moat/ops"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
            >
              Ops
            </Link>
            <Link
              href="/admin/moat/outcomes"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
            >
              Outcomes
            </Link>
            <Link
              href="/admin/moat/shadow"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
            >
              Shadow
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded-lg border border-[#E8761A]/40 px-4 py-2 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/10 disabled:opacity-50"
            >
              {refreshing ? 'Herberekenen…' : 'Herbereken'}
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-white/40">Laden…</p>}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {data?.notes?.length ? (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 print:border-amber-600 print:text-amber-900">
            {data.notes.map(n => <p key={n}>{n}</p>)}
          </div>
        ) : null}

        {/* Product vs moat callout */}
        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-5 py-4 print:border-black/20">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/80 print:text-black/50">
              Product
            </p>
            <p className="mt-1 text-sm font-semibold text-white print:text-black">Altijd beschikbaar</p>
            <p className="mt-1 text-xs text-white/50 print:text-black/60">
              Dwight-voorspelling + BRO. Verbetering via lokale precedenten (L4) en grondsoort / Ω·m-groepen (L2/L3).
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8761A]/30 bg-[#E8761A]/5 px-5 py-4 print:border-black/20">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]/80 print:text-black/50">
              Moat (data-bewijs)
            </p>
            <p className="mt-1 text-sm font-semibold text-white print:text-black">Groeit met outcomes</p>
            <p className="mt-1 text-xs text-white/50 print:text-black/60">
              Confidence = genoeg confirmed metingen + strakke voorspellingsfout om een regionale claim te staven.
            </p>
          </div>
        </section>

        {board && m && (
          <section className="mb-8 rounded-2xl border border-white/8 bg-[#111] p-6 print:border-black/15 print:bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 print:text-black/50">
              Moat Index
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-4">
              <p className="font-condensed text-5xl font-black text-[#E8761A] print:text-black">
                {board.moatScore.toFixed(1)}
                <span className="text-2xl text-white/30 print:text-black/40"> / 10</span>
              </p>
              <p className="mb-1 text-xs text-white/40 print:text-black/50">
                Doel 12 mnd: {board.targetScore.toFixed(1)} · {board.trendLabel}
              </p>
            </div>
            <ScoreBar score={board.moatScore} />
            <p className="mt-4 text-sm text-white/70 print:text-black/80">{board.interpretation}</p>
            <p className="mt-2 text-[11px] text-white/30 print:text-black/45">
              {claimReady}/{m.region_count} regio’s klaar voor data-claim (≥70% outcome-confidence) ·{' '}
              {data?.signatureCount ?? 0} signatures · volume {m.total_measurements}/{m.target_measurements}
            </p>
          </section>
        )}

        {board && (
          <section className="mb-8 rounded-2xl border border-white/8 bg-[#111] p-6 print:border-black/15 print:bg-white">
            <h2 className="font-condensed text-lg font-bold print:text-black">Moat-componenten</h2>
            <p className="mt-1 text-xs text-white/40 print:text-black/50">
              Index = 40% volume + 40% confidence + 20% empirische blend-tracking. Geografie hier als leesbaar detail.
            </p>
            <ul className="mt-4 space-y-4">
              {board.components.map(c => (
                <li key={c.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium print:text-black">{c.label}</span>
                    <span className="tabular-nums text-[#E8761A] print:text-black">{c.score0to10.toFixed(1)}/10</span>
                  </div>
                  <ScoreBar score={c.score0to10} />
                  <p className="mt-1 text-[11px] text-white/35 print:text-black/50">{c.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && data.geographic.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111] print:border-black/15 print:bg-white">
            <div className="border-b border-white/6 px-6 py-4 print:border-black/10">
              <h2 className="font-condensed text-lg font-bold print:text-black">Geografische moat</h2>
              <p className="mt-1 text-xs text-white/40 print:text-black/50">
                Status = data-claim gereedheid. Product blijft overal bruikbaar.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-white/35 print:text-black/50">
                  <tr>
                    <th className="px-4 py-3">Regio</th>
                    <th className="px-4 py-3">Bodem</th>
                    <th className="px-4 py-3">n</th>
                    <th className="px-4 py-3">Conf.</th>
                    <th className="px-4 py-3">Fout%</th>
                    <th className="px-4 py-3">Emp%</th>
                    <th className="px-4 py-3">Moat-status</th>
                    <th className="px-4 py-3">Data-claim</th>
                    <th className="px-4 py-3 print:hidden">Drill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 print:divide-black/10">
                  {data.geographic.map(r => {
                    const level = moatReadinessFromConfidence(r.confidence_score);
                    const status = normalizeReadinessStatus(r.readiness_status, r.confidence_score);
                    return (
                      <tr key={`${r.region_name}-${r.soil_type}`} title={moatReadinessHint(level)}>
                        <td className="px-4 py-2.5 font-medium print:text-black">{r.region_name}</td>
                        <td className="px-4 py-2.5 text-white/60 print:text-black/60">{r.soil_type}</td>
                        <td className="px-4 py-2.5 tabular-nums print:text-black">{r.measurement_count}</td>
                        <td className="px-4 py-2.5 tabular-nums print:text-black">
                          {r.confidence_score != null ? `${(Number(r.confidence_score) * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-white/60 print:text-black/60">
                          {r.avg_prediction_error_pct != null ? Number(r.avg_prediction_error_pct).toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-white/60 print:text-black/60">
                          {r.empirical_percentage != null ? Number(r.empirical_percentage).toFixed(0) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-xs font-medium ${readinessTone(level)} print:text-black`}>
                          {status || moatReadinessLabel(level)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[#E8761A] print:text-black">
                          {dataClaimTierLabel(r.pricing_tier)}
                        </td>
                        <td className="px-4 py-2.5 text-xs print:hidden">
                          <Link
                            href={`/admin/moat/outcomes?region=${encodeURIComponent(r.region_name)}`}
                            className="text-[#E8761A] hover:underline"
                          >
                            outcomes
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Competitive position — honest, static framing */}
        <section className="mb-8 rounded-2xl border border-white/8 bg-[#111] p-6 print:border-black/15 print:bg-white">
          <h2 className="font-condensed text-lg font-bold print:text-black">Concurrentiepositie</h2>
          <p className="mt-1 text-xs text-white/40 print:text-black/50">
            Kwalitatief kader — geen concurrent-API. Edge = outcomes + snelheid, niet alleen de formule.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-white/35 print:text-black/50">
                <tr>
                  <th className="px-2 py-2"> </th>
                  <th className="px-2 py-2">EarthGND</th>
                  <th className="px-2 py-2">Standaardtabellen</th>
                  <th className="px-2 py-2">BRO alleen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/70 print:divide-black/10 print:text-black/80">
                <tr>
                  <td className="px-2 py-2 text-white/40 print:text-black/50">Voorspelling</td>
                  <td className="px-2 py-2">Dwight + gelaagd ρ</td>
                  <td className="px-2 py-2">Generiek</td>
                  <td className="px-2 py-2">Bodemdata, geen installatie-Ra</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 text-white/40 print:text-black/50">Lokale outcomes</td>
                  <td className="px-2 py-2 text-emerald-400 print:text-black">Ja (groeiend)</td>
                  <td className="px-2 py-2">Nee</td>
                  <td className="px-2 py-2">Nee</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 text-white/40 print:text-black/50">Grondsoort-leren</td>
                  <td className="px-2 py-2">L2/L3 Ω·m priors</td>
                  <td className="px-2 py-2">Vast</td>
                  <td className="px-2 py-2">Lithologie, geen Ra-feedback</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 text-white/40 print:text-black/50">Snelheid</td>
                  <td className="px-2 py-2">&lt;1 min</td>
                  <td className="px-2 py-2">Handmatig</td>
                  <td className="px-2 py-2">Lookup</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {data && data.growth.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111] print:border-black/15 print:bg-white">
            <div className="border-b border-white/6 px-6 py-4 print:border-black/10">
              <h2 className="font-condensed text-lg font-bold print:text-black">Groei outcomes</h2>
            </div>
            <ul className="divide-y divide-white/5 px-6 print:divide-black/10">
              {data.growth.slice(0, 12).map(g => (
                <li key={g.month} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-white/60 print:text-black/60">
                    {new Date(g.month).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                  </span>
                  <span className="tabular-nums text-white print:text-black">
                    +{g.measurements_this_month} · cum {g.cumulative_total}
                  </span>
                  <span className="text-xs text-white/40 print:text-black/50">{g.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && (
          <p className="text-[11px] text-white/25 print:text-black/40">
            Snapshot: {new Date(data.queriedAt).toLocaleString('nl-NL')} · docs/moat-data-dictionary.md
          </p>
        )}
      </div>
    </div>
  );
}
