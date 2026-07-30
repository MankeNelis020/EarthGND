'use client';

import { FormEvent, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { PRODUCT_AVAILABILITY_LINE } from '@/lib/moat/labels';

interface SalesResponse {
  query: string | null;
  geo: {
    lat: number;
    lon: number;
    postcode: string | null;
    straatnaam: string | null;
    huisnummer: string | null;
    woonplaats: string | null;
  } | null;
  radiusM?: number;
  region: {
    region_name: string;
    soil_type: string;
    measurement_count: number;
    confidence_score: number | null;
    moat_status: string;
    data_claim_tier: string;
    avg_prediction_error_pct: number | null;
    product_note: string;
  } | null;
  nearby: Array<{
    id: string;
    distanceM: number;
    postcode: string | null;
    huisnummer: string | null;
    straatnaam: string | null;
    woonplaats: string | null;
    installed_depth: number | null;
    predicted_depth_m: number | null;
    depth_error_percent: number | null;
    prediction_accuracy_category: string | null;
    hasPredictionLink: boolean;
  }>;
  pitch: {
    n: number;
    withAccuracy: number;
    medianInstalledDepth: number | null;
    shareNotMiss: number | null;
    pitchLine: string;
  } | null;
  productNote: string;
  error?: string;
}

export default function MoatSalesPage() {
  const [q, setQ] = useState('');
  const [radius, setRadius] = useState(2000);
  const [data, setData] = useState<SalesResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ q: q.trim(), radius: String(radius) });
      const res = await fetch(`/api/admin/moat/sales?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Zoeken mislukt');
        setData(null);
        return;
      }
      setData(json as SalesResponse);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <Link href="/admin/moat" className="hover:text-[#E8761A]">Directeur</Link>
          <span>/</span>
          <span className="text-white/70">Sales</span>
          <span className="text-white/20">·</span>
          <Link href="/admin/moat/ops" className="hover:text-[#E8761A]">Operations</Link>
        </div>

        <h1 className="font-condensed text-3xl font-black">Sales battlefield</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">{PRODUCT_AVAILABILITY_LINE}</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/35">
              Klantadres / postcode
            </label>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Bijv. Trawlerkade 4, IJmuiden"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-[#E8761A]/50 focus:outline-none"
            />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/35">
              Radius (m)
            </label>
            <input
              type="number"
              min={200}
              max={10000}
              step={100}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-[#E8761A]/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="rounded-lg bg-[#E8761A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] disabled:opacity-50"
          >
            {loading ? 'Zoeken…' : 'Zoek outcomes'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {data?.geo && (
          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-[#111] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Locatie</p>
              <p className="mt-2 text-sm font-semibold">
                {[data.geo.straatnaam, data.geo.huisnummer].filter(Boolean).join(' ') || data.query}
              </p>
              <p className="text-xs text-white/45">
                {[data.geo.postcode, data.geo.woonplaats].filter(Boolean).join(' ')}
                {' · '}{data.geo.lat.toFixed(4)}, {data.geo.lon.toFixed(4)}
              </p>
              <p className="mt-2 text-[11px] text-white/30">Zoekradius {data.radiusM} m</p>
            </div>

            {data.region && (
              <div className="rounded-2xl border border-[#E8761A]/25 bg-[#E8761A]/5 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]/80">
                  Regio-moat
                </p>
                <p className="mt-2 text-lg font-bold">{data.region.region_name}</p>
                <p className="text-sm text-white/70">{data.region.moat_status}</p>
                <p className="mt-2 text-xs text-white/50">
                  n={data.region.measurement_count}
                  {data.region.confidence_score != null
                    && ` · conf ${(data.region.confidence_score * 100).toFixed(0)}%`}
                  {' · '}{data.region.data_claim_tier}
                </p>
                <p className="mt-2 text-[11px] text-white/40">{data.region.product_note}</p>
              </div>
            )}
          </section>
        )}

        {data?.pitch && (
          <section className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/80">
              Pitch (lokaal)
            </p>
            <p className="mt-2 text-sm text-white/80">{data.pitch.pitchLine}</p>
            <p className="mt-2 text-[11px] text-white/35">
              {data.pitch.n} outcomes · {data.pitch.withAccuracy} met accuracy-categorie
              {data.pitch.shareNotMiss != null ? ` · ${data.pitch.shareNotMiss}% geen miss` : ''}
            </p>
          </section>
        )}

        {data && data.nearby.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-5 py-4">
              <h2 className="font-condensed text-lg font-bold">Vergelijkbare outcomes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-white/35">
                  <tr>
                    <th className="px-4 py-3">Afstand</th>
                    <th className="px-4 py-3">Adres</th>
                    <th className="px-4 py-3">Diepte</th>
                    <th className="px-4 py-3">Voorspeld</th>
                    <th className="px-4 py-3">Fout%</th>
                    <th className="px-4 py-3">Cat.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.nearby.map(n => (
                    <tr key={n.id}>
                      <td className="px-4 py-2.5 tabular-nums text-white/70">
                        {n.distanceM < 1000
                          ? `${Math.round(n.distanceM)} m`
                          : `${(n.distanceM / 1000).toFixed(1)} km`}
                      </td>
                      <td className="px-4 py-2.5">
                        {[n.straatnaam, n.huisnummer].filter(Boolean).join(' ') || '—'}
                        <span className="block text-[11px] text-white/35">
                          {[n.postcode, n.woonplaats].filter(Boolean).join(' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {n.installed_depth != null ? `${n.installed_depth.toFixed(1)} m` : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {n.predicted_depth_m != null ? `${n.predicted_depth_m.toFixed(1)} m` : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-white/60">
                        {n.depth_error_percent != null
                          ? `${Number(n.depth_error_percent).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/50">
                        {n.prediction_accuracy_category ?? (n.hasPredictionLink ? '—' : 'geen link')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {data && data.nearby.length === 0 && data.geo && (
          <p className="mt-6 text-sm text-white/45">
            Geen confirmed outcomes binnen {data.radiusM} m. Product blijft beschikbaar; vergende radius of verzamel meer metingen.
          </p>
        )}
      </div>
    </div>
  );
}
