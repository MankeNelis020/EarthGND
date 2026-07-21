'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  SoilMonitoringData,
  MonitoringConfig,
  DailyAggregate,
  RecentCalculation,
  Alarm,
} from '@/app/api/admin/soil-monitoring/route';

// ─── Config card ──────────────────────────────────────────────────────────────

function ConfigCard({ config }: { config: MonitoringConfig }) {
  const rows: { label: string; value: string; warn?: boolean }[] = [
    {
      label: 'SOIL_KNOWLEDGE_ACTIVE',
      value: config.soilKnowledgeActive ? 'true ✓' : 'false — L1 only',
      warn:  !config.soilKnowledgeActive,
    },
    {
      label: 'EMERGENCY_ROLLBACK',
      value: config.emergencyRollback ? 'true ⚠ actief' : 'false',
      warn:  config.emergencyRollback,
    },
    { label: 'EMPIRICAL_WEIGHT',     value: String(config.empiricalWeight) },
    { label: 'ENABLED_CLASSES',      value: config.enabledClasses },
    { label: 'CONFIDENCE_THRESHOLD', value: String(config.confidenceThreshold) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Configuratie (env)
      </h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map(({ label, value, warn }) => (
          <div key={label} className="flex justify-between py-1.5 gap-4">
            <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{label}</span>
            <span className={`text-xs font-mono font-medium ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Alarm list ───────────────────────────────────────────────────────────────

function AlarmList({ alarms }: { alarms: Alarm[] }) {
  if (alarms.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">
        Geen actieve alarmen — alles groen.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alarms.map((alarm, i) => (
        <div
          key={i}
          className={`rounded-xl border px-4 py-3 text-sm ${
            alarm.type === 'rollback_active'
              ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30 text-red-700 dark:text-red-400'
              : alarm.type === 'low_confidence'
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
              : 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400'
          }`}
        >
          {alarm.message}
        </div>
      ))}
    </div>
  );
}

// ─── Daily aggregates table ───────────────────────────────────────────────────

function DailyTable({ rows }: { rows: DailyAggregate[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        Nog geen berekeningen met empirische blend. Activeer SOIL_KNOWLEDGE_ACTIVE=true op staging.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Dag</th>
            <th className="py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">N</th>
            <th className="py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Blend toegepast</th>
            <th className="py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Gem. confidence</th>
            <th className="py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Min. confidence</th>
            <th className="py-2 font-semibold text-gray-500 dark:text-gray-400">Bronnen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => {
            const avgOk  = row.avgConfidence !== null && row.avgConfidence >= 0.3;
            const minOk  = row.minConfidence !== null && row.minConfidence >= 0.3;
            const sourceSummary = Object.entries(row.sources)
              .map(([src, n]) => `${src.replace('l', 'L').replace('_', ' ')}(${n})`)
              .join(', ');
            return (
              <tr key={row.dag} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <td className="py-2 pr-4 font-mono text-gray-700 dark:text-gray-300">{row.dag}</td>
                <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{row.n}</td>
                <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                  {row.blendApplied}/{row.n}
                </td>
                <td className={`py-2 pr-4 font-medium ${avgOk ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {row.avgConfidence !== null ? `${(row.avgConfidence * 100).toFixed(0)}%` : '—'}
                </td>
                <td className={`py-2 pr-4 font-medium ${minOk ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {row.minConfidence !== null ? `${(row.minConfidence * 100).toFixed(0)}%` : '—'}
                </td>
                <td className="py-2 text-gray-500 dark:text-gray-400 truncate max-w-xs">{sourceSummary || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Recent calculations ──────────────────────────────────────────────────────

function RecentCalcTable({ calcs }: { calcs: RecentCalculation[] }) {
  if (calcs.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        Geen berekeningen met empirische data in de afgelopen 24 uur.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">Tijd</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">PC</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">Bron</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">Conf.</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">ρ L1</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">ρ Emp.</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 dark:text-gray-400">ρ Blend</th>
            <th className="py-2 font-semibold text-gray-500 dark:text-gray-400">Blend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {calcs.map((calc) => (
            <tr key={calc.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
              <td className="py-1.5 pr-3 font-mono text-gray-500 dark:text-gray-400">
                {new Date(calc.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">
                {calc.postcode ?? '—'}
              </td>
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 font-mono">
                {calc.empiricalSource.replace('l', 'L').replace('_', ' ')}
              </td>
              <td className={`py-1.5 pr-3 font-medium ${
                calc.empiricalConfidence !== null && calc.empiricalConfidence >= 0.5
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {calc.empiricalConfidence !== null ? `${(calc.empiricalConfidence * 100).toFixed(0)}%` : '—'}
              </td>
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                {calc.l1Rho !== null ? `${calc.l1Rho} Ω` : '—'}
              </td>
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                {calc.empiricalRho !== null ? `${calc.empiricalRho} Ω` : '—'}
              </td>
              <td className="py-1.5 pr-3 font-medium text-blue-700 dark:text-blue-400">
                {calc.blendedRho !== null ? `${calc.blendedRho} Ω` : '—'}
              </td>
              <td className="py-1.5">
                {calc.blendApplied
                  ? <span className="text-green-700 dark:text-green-400">✓</span>
                  : <span className="text-gray-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Rollback instructions ────────────────────────────────────────────────────

function RollbackPanel({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      active
        ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Emergency Rollback
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {active
              ? 'Rollback is ACTIEF — alle berekeningen gebruiken L1.'
              : 'Niet actief. Gebruik dit bij onverwacht gedrag.'}
          </p>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
            active
              ? 'bg-red-600 text-white'
              : 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
          }`}
        >
          {open ? 'Verberg instructies' : 'Toon instructies'}
        </button>
      </div>

      {open && (
        <div className="space-y-2 text-sm">
          <p className="text-gray-700 dark:text-gray-300">
            Zet <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono text-xs">EMERGENCY_ROLLBACK=true</code> in de omgevingsvariabelen van je deployment:
          </p>
          <pre className="bg-gray-900 text-green-400 rounded-lg px-4 py-3 text-xs overflow-x-auto">
{`# Vercel / hosting platform
EMERGENCY_ROLLBACK=true

# Direct effect (geen herstart nodig in Next.js App Router)
# Alle berekeningen gebruiken automatisch L1 literatuurprior.
# Herstel: zet EMERGENCY_ROLLBACK=false of verwijder de variabele.`}
          </pre>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Geen herstart nodig — de waarde wordt per request gelezen.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SoilMonitoringPage() {
  const [data,    setData]    = useState<SoilMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/soil-monitoring');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setData(await res.json() as SoilMonitoringData);
      setLastFetch(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Soil Knowledge — Monitoring
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Poort D staging — empirische blend van geleidende klasse
              {lastFetch && (
                <> · bijgewerkt {lastFetch.toLocaleTimeString('nl-NL')}</>
              )}
            </p>
          </div>
          <button
            onClick={fetchData}
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
            {loading ? 'Bezig…' : 'Vernieuwen'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 h-24 animate-pulse bg-gray-100 dark:bg-gray-900" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Alarms */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Alarms
              </h2>
              <AlarmList alarms={data.alarms} />
            </div>

            {/* Config */}
            <ConfigCard config={data.config} />

            {/* Daily table */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Dagelijks overzicht — laatste 14 dagen
              </h2>
              <DailyTable rows={data.dailyAggs} />
            </div>

            {/* Recent calcs */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Recente berekeningen met empirische data — afgelopen 24u
              </h2>
              <RecentCalcTable calcs={data.recentCalcs} />
            </div>

            {/* Rollback */}
            <RollbackPanel active={data.config.emergencyRollback} />
          </>
        )}
      </div>
    </div>
  );
}
