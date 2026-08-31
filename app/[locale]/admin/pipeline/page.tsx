'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SourceResult, SourceStatus } from '@/app/api/admin/pipeline-status/route';
import { AdminPageHeader } from '@/components/admin/AdminShell';

interface PipelineData {
  timestamp: string;
  testLocation: { lat: number; lon: number; rdX: number; rdY: number; label: string };
  sources: Record<string, SourceResult>;
  coverageEstimate: string;
  okCount: number;
  totalCount: number;
}

const SOURCE_META: Record<string, { label: string; description: string; role: string }> = {
  cpt: {
    label: 'BRO CPT',
    description: 'publiek.broservices.nl/sr/cpt/v1',
    role: 'Sonderingen — meest nauwkeurig (±10%)',
  },
  bhrgt: {
    label: 'BRO BHR-GT',
    description: 'publiek.broservices.nl/sr/bhrgt/v2',
    role: 'Geotechnische boringen — 2→5→10 km radius (±20%)',
  },
  geotop: {
    label: 'GeoTOP',
    description: 'dinodata.nl OPeNDAP GeoTOP v1.6.1',
    role: 'TNO voxelmodel 100×100m — dekt ~85% NL (±30%)',
  },
  bodemkaart: {
    label: 'Bodemkaart',
    description: 'Supabase RPC get_bodemkaart_at_point',
    role: 'Lokale PostGIS — 48k polygonen, dekt ~83% NL (±35%)',
  },
  pdok: {
    label: 'PDOK Locatieserver',
    description: 'api.pdok.nl/bzk/locatieserver',
    role: 'Postcode → coördinaten (vereist voor alle andere bronnen)',
  },
  grondwater: {
    label: 'BRO Grondwater',
    description: 'api.pdok.nl/tno/bro-grondwatermonitoring',
    role: "GHG uit peilbuizen — verbetert seizoensscenario's",
  },
};

const PIPELINE_ORDER = ['cpt', 'bhrgt', 'geotop', 'bodemkaart'];

function statusColor(status: SourceStatus) {
  switch (status) {
    case 'ok':
      return 'bg-emerald-500';
    case 'no_data':
      return 'bg-amber-400';
    case 'down':
      return 'bg-red-500';
    case 'timeout':
      return 'bg-red-400';
  }
}

function statusLabel(status: SourceStatus) {
  switch (status) {
    case 'ok':
      return 'Online';
    case 'no_data':
      return 'Online — geen data';
    case 'down':
      return 'Down';
    case 'timeout':
      return 'Timeout';
  }
}

function statusTextColor(status: SourceStatus) {
  switch (status) {
    case 'ok':
      return 'text-emerald-400';
    case 'no_data':
      return 'text-amber-300';
    case 'down':
      return 'text-red-400';
    case 'timeout':
      return 'text-red-400';
  }
}

function CoverageBar({ sources }: { sources: Record<string, SourceResult> }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full">
      {PIPELINE_ORDER.map((key) => (
        <div
          key={key}
          className={`h-full flex-1 transition-colors ${statusColor(sources[key]?.status ?? 'down')}`}
          title={`${SOURCE_META[key].label}: ${statusLabel(sources[key]?.status ?? 'down')}`}
        />
      ))}
    </div>
  );
}

function SourceCard({ id, result }: { id: string; result: SourceResult }) {
  const meta = SOURCE_META[id];
  const isInPipeline = PIPELINE_ORDER.includes(id);
  const tone =
    result.status === 'ok'
      ? 'border-emerald-500/25 bg-emerald-500/10'
      : result.status === 'no_data'
        ? 'border-amber-500/25 bg-amber-500/10'
        : 'border-red-500/25 bg-red-500/10';

  return (
    <div className={`space-y-2 rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusColor(result.status)}`} />
          <span className="text-sm font-semibold text-stone-100">{meta.label}</span>
          {isInPipeline && (
            <span className="text-xs text-white/35">#{PIPELINE_ORDER.indexOf(id) + 1} in keten</span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-xs text-white/40">{result.latencyMs} ms</span>
          <span className={`text-xs font-medium ${statusTextColor(result.status)}`}>
            {statusLabel(result.status)}
          </span>
        </div>
      </div>
      <p className="truncate font-mono text-xs text-white/40">{meta.description}</p>
      <p className="text-xs text-white/60">{meta.role}</p>
      {result.detail && (
        <p
          className={`rounded px-2 py-1 font-mono text-xs ${
            result.status === 'ok'
              ? 'bg-emerald-500/15 text-emerald-200'
              : 'bg-red-500/15 text-red-200'
          }`}
        >
          {result.detail}
        </p>
      )}
    </div>
  );
}

const REFRESH_INTERVAL = 30;

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetch_status = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pipeline-status');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
      setLastFetch(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_status();
  }, [fetch_status]);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetch_status();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, fetch_status]);

  const pipelineSources = PIPELINE_ORDER;
  const supportSources = Object.keys(SOURCE_META).filter((k) => !pipelineSources.includes(k));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Instrumentatie"
        title="Pipeline Status"
        description={
          <>
            Bodemdata-bronnen — testlocatie:{' '}
            <span className="font-mono text-white/70">
              {data?.testLocation.label ?? 'Arnhem'} (rdX={data?.testLocation.rdX ?? 192000}, rdY=
              {data?.testLocation.rdY ?? 445000})
            </span>
          </>
        }
        actions={
          <button
            type="button"
            onClick={fetch_status}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E8761A]/40 px-4 py-2 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/10 disabled:opacity-50"
          >
            {loading ? 'Bezig…' : `Vernieuwen (${countdown}s)`}
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div
            className={`space-y-3 rounded-xl border p-4 ${
              data.okCount === data.totalCount
                ? 'border-emerald-500/25 bg-emerald-500/10'
                : data.okCount >= data.totalCount / 2
                  ? 'border-amber-500/25 bg-amber-500/10'
                  : 'border-red-500/25 bg-red-500/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-100">
                  {data.okCount}/{data.totalCount} bronnen online
                </p>
                <p className="mt-0.5 text-xs text-white/45">
                  Geschatte dekking van Nederlands grondgebied:{' '}
                  <span className="font-semibold text-white/80">{data.coverageEstimate}</span>
                </p>
              </div>
              {lastFetch && (
                <p className="text-right text-xs text-white/35">
                  Laatste check
                  <br />
                  {lastFetch.toLocaleTimeString('nl-NL')}
                </p>
              )}
            </div>
            <CoverageBar sources={data.sources} />
            <div className="flex flex-wrap gap-3 text-xs text-white/45">
              {PIPELINE_ORDER.map((key) => (
                <span key={key} className="flex items-center gap-1">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${statusColor(data.sources[key]?.status ?? 'down')}`}
                  />
                  {SOURCE_META[key].label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              Fallback-keten (prioriteit volgorde)
            </h2>
            <div className="space-y-3">
              {pipelineSources.map((key) => (
                <SourceCard key={key} id={key} result={data.sources[key]} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              Ondersteuning
            </h2>
            <div className="space-y-3">
              {supportSources.map((key) => (
                <SourceCard key={key} id={key} result={data.sources[key]} />
              ))}
            </div>
          </div>
        </>
      )}

      {loading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          ))}
        </div>
      )}
    </div>
  );
}
