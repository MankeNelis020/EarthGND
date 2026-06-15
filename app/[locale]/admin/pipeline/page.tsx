'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SourceResult, SourceStatus } from '@/app/api/admin/pipeline-status/route';

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
    description: 'publiek.broservices.nl/sr/geotop/v1',
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
    role: 'GHG uit peilbuizen — verbetert seizoensscenario\'s',
  },
};

const PIPELINE_ORDER = ['cpt', 'bhrgt', 'geotop', 'bodemkaart'];

function statusColor(status: SourceStatus) {
  switch (status) {
    case 'ok':      return 'bg-green-500';
    case 'no_data': return 'bg-yellow-400';
    case 'down':    return 'bg-red-500';
    case 'timeout': return 'bg-red-400';
  }
}

function statusLabel(status: SourceStatus) {
  switch (status) {
    case 'ok':      return 'Online';
    case 'no_data': return 'Online — geen data';
    case 'down':    return 'Down';
    case 'timeout': return 'Timeout';
  }
}

function statusTextColor(status: SourceStatus) {
  switch (status) {
    case 'ok':      return 'text-green-700 dark:text-green-400';
    case 'no_data': return 'text-yellow-700 dark:text-yellow-400';
    case 'down':    return 'text-red-700 dark:text-red-400';
    case 'timeout': return 'text-red-600 dark:text-red-400';
  }
}

function CoverageBar({ sources }: { sources: Record<string, SourceResult> }) {
  const layers = PIPELINE_ORDER.map((key) => ({
    key,
    meta: SOURCE_META[key],
    status: sources[key]?.status ?? 'down',
  }));

  return (
    <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden w-full">
      {layers.map(({ key, status }) => (
        <div
          key={key}
          className={`h-full flex-1 transition-colors ${statusColor(status)}`}
          title={`${SOURCE_META[key].label}: ${statusLabel(status)}`}
        />
      ))}
    </div>
  );
}

function SourceCard({ id, result }: { id: string; result: SourceResult }) {
  const meta = SOURCE_META[id];
  const isInPipeline = PIPELINE_ORDER.includes(id);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${
      result.status === 'ok'
        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
        : result.status === 'no_data'
        ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor(result.status)}`} />
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{meta.label}</span>
          {isInPipeline && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              #{PIPELINE_ORDER.indexOf(id) + 1} in keten
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400">{result.latencyMs} ms</span>
          <span className={`text-xs font-medium ${statusTextColor(result.status)}`}>
            {statusLabel(result.status)}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{meta.description}</p>
      <p className="text-xs text-gray-600 dark:text-gray-300">{meta.role}</p>
      {result.detail && (
        <p className={`text-xs px-2 py-1 rounded font-mono ${
          result.status === 'ok'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
        }`}>
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

  // Auto-refresh countdown
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Pipeline Status
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Bodemdata-bronnen — testlocatie:{' '}
              <span className="font-mono">
                {data?.testLocation.label ?? 'Arnhem'} (rdX={data?.testLocation.rdX ?? 192000}, rdY={data?.testLocation.rdY ?? 445000})
              </span>
            </p>
          </div>
          <button
            onClick={fetch_status}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? 'Bezig…' : `Vernieuwen (${countdown}s)`}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Summary banner */}
            <div className={`rounded-xl border p-4 space-y-3 ${
              data.okCount === data.totalCount
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                : data.okCount >= data.totalCount / 2
                ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {data.okCount}/{data.totalCount} bronnen online
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Geschatte dekking van Nederlands grondgebied:{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {data.coverageEstimate}
                    </span>
                  </p>
                </div>
                {lastFetch && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
                    Laatste check<br />
                    {lastFetch.toLocaleTimeString('nl-NL')}
                  </p>
                )}
              </div>
              <CoverageBar sources={data.sources} />
              <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                {PIPELINE_ORDER.map((key) => (
                  <span key={key} className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${statusColor(data.sources[key]?.status ?? 'down')}`} />
                    {SOURCE_META[key].label}
                  </span>
                ))}
              </div>
            </div>

            {/* Pipeline sources */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Fallback-keten (prioriteit volgorde)
              </h2>
              <div className="space-y-3">
                {pipelineSources.map((key) => (
                  <SourceCard key={key} id={key} result={data.sources[key]} />
                ))}
              </div>
            </div>

            {/* Support sources */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
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
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 h-24 animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
