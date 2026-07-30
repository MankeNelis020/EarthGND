'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

interface Outcome {
  id: string;
  calculation_id: string | null;
  href: string | null;
  status: string | null;
  postcode: string | null;
  straatnaam: string | null;
  huisnummer: string | null;
  woonplaats: string | null;
  installed_depth: number | null;
  predicted_depth_m: number | null;
  depth_error_percent: number | null;
  prediction_accuracy_category: string | null;
  regional_cluster_id: string | null;
  is_outlier: boolean;
  confirmed_at: string | null;
}

export default function MoatOutcomesPage() {
  const search = useSearchParams();
  const pathname = usePathname();
  const region = search.get('region') ?? '';
  const week = search.get('week') ?? '';
  const category = search.get('category') ?? '';
  const unlinked = search.get('unlinked') === '1';

  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (region) params.set('region', region);
      if (week) params.set('week', week);
      if (category) params.set('category', category);
      if (unlinked) params.set('unlinked', '1');
      params.set('limit', '80');
      const res = await fetch(`/api/admin/moat/outcomes?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Laden mislukt');
        setOutcomes([]);
        return;
      }
      setOutcomes(json.outcomes ?? []);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, [region, week, category, unlinked]);

  useEffect(() => { void load(); }, [load]);

  const filterBits = [
    region && `regio ${region}`,
    week && `week ${week}`,
    category && `cat ${category}`,
    unlinked && 'zonder prediction-link',
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <Link href="/admin/moat" className="hover:text-[#E8761A]">Directeur</Link>
          <span>/</span>
          <Link href="/admin/moat/ops" className="hover:text-[#E8761A]">Ops</Link>
          <span>/</span>
          <span className="text-white/70">Outcomes</span>
        </div>

        <h1 className="font-condensed text-3xl font-black">Outcome drill-down</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">{PRODUCT_AVAILABILITY_LINE}</p>
        {filterBits.length > 0 && (
          <p className="mt-2 text-xs text-white/40">
            Filter: {filterBits.join(' · ')}
            {' · '}
            <Link href="/admin/moat/outcomes" className="text-[#E8761A] hover:underline">
              wis filters
            </Link>
          </p>
        )}

        {loading && <p className="mt-6 text-sm text-white/40">Laden…</p>}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && outcomes.length === 0 && !error && (
          <p className="mt-6 text-sm text-white/45">Geen outcomes voor dit filter.</p>
        )}

        {outcomes.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-5 py-4 flex justify-between">
              <h2 className="font-condensed text-lg font-bold">{outcomes.length} outcomes</h2>
              <button
                type="button"
                onClick={() => void load()}
                className="text-xs text-white/40 hover:text-white"
              >
                Vernieuwen
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-white/35">
                  <tr>
                    <th className="px-4 py-3">Locatie</th>
                    <th className="px-4 py-3">Regio</th>
                    <th className="px-4 py-3">Diepte</th>
                    <th className="px-4 py-3">Voorspeld</th>
                    <th className="px-4 py-3">Fout%</th>
                    <th className="px-4 py-3">Cat.</th>
                    <th className="px-4 py-3">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {outcomes.map(o => (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5">
                        {[o.straatnaam, o.huisnummer].filter(Boolean).join(' ') || '—'}
                        <span className="block text-[11px] text-white/35">
                          {[o.postcode, o.woonplaats].filter(Boolean).join(' ')}
                          {o.is_outlier ? ' · outlier' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/60">
                        {o.regional_cluster_id ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {o.installed_depth != null ? `${o.installed_depth.toFixed(1)} m` : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {o.predicted_depth_m != null ? `${o.predicted_depth_m.toFixed(1)} m` : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {o.depth_error_percent != null
                          ? `${Number(o.depth_error_percent).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/50">
                        {o.prediction_accuracy_category ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {o.href ? (
                          <Link
                            href={o.href}
                            className="text-[#E8761A] hover:underline"
                            target="_blank"
                          >
                            open
                          </Link>
                        ) : (
                          <span className="text-white/25">geen calc</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p className="mt-6 text-[11px] text-white/25">
          Pad: {pathname}
        </p>
      </div>
    </div>
  );
}
