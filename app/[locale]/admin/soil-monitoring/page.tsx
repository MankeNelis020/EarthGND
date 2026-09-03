'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  SoilMonitoringData,
  MonitoringConfig,
  DailyAggregate,
  RecentCalculation,
  Alarm,
} from '@/app/api/admin/soil-monitoring/route';
import { AdminPageHeader } from '@/components/admin/AdminShell';

function ConfigCard({ config }: { config: MonitoringConfig }) {
  const rows: { label: string; value: string; warn?: boolean }[] = [
    {
      label: 'SOIL_KNOWLEDGE_ACTIVE',
      value: config.soilKnowledgeActive ? 'true ✓' : 'false — L1 only',
      warn: !config.soilKnowledgeActive,
    },
    {
      label: 'EMERGENCY_ROLLBACK',
      value: config.emergencyRollback ? 'true ⚠ actief' : 'false',
      warn: config.emergencyRollback,
    },
    { label: 'EMPIRICAL_WEIGHT', value: String(config.empiricalWeight) },
    { label: 'ENABLED_CLASSES', value: config.enabledClasses },
    { label: 'CONFIDENCE_THRESHOLD', value: String(config.confidenceThreshold) },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
        Configuratie (env)
      </h2>
      <div className="divide-y divide-white/8">
        {rows.map(({ label, value, warn }) => (
          <div key={label} className="flex justify-between gap-4 py-1.5">
            <span className="font-mono text-xs text-white/45">{label}</span>
            <span className={`font-mono text-xs font-medium ${warn ? 'text-amber-300' : 'text-stone-100'}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlarmList({ alarms }: { alarms: Alarm[] }) {
  if (alarms.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
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
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : alarm.type === 'low_confidence'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
          }`}
        >
          {alarm.message}
        </div>
      ))}
    </div>
  );
}

function DailyTable({ rows }: { rows: DailyAggregate[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm italic text-white/40">
        Nog geen berekeningen met empirische blend. Activeer SOIL_KNOWLEDGE_ACTIVE=true op staging.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 pr-4 font-semibold text-white/40">Dag</th>
            <th className="py-2 pr-4 font-semibold text-white/40">N</th>
            <th className="py-2 pr-4 font-semibold text-white/40">Blend toegepast</th>
            <th className="py-2 pr-4 font-semibold text-white/40">Gem. confidence</th>
            <th className="py-2 pr-4 font-semibold text-white/40">Min. confidence</th>
            <th className="py-2 font-semibold text-white/40">Bronnen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/8">
          {rows.map((row) => {
            const avgOk = row.avgConfidence !== null && row.avgConfidence >= 0.3;
            const minOk = row.minConfidence !== null && row.minConfidence >= 0.3;
            const sourceSummary = Object.entries(row.sources)
              .map(([src, n]) => `${src.replace('l', 'L').replace('_', ' ')}(${n})`)
              .join(', ');
            return (
              <tr key={row.dag} className="hover:bg-white/5">
                <td className="py-2 pr-4 font-mono text-white/70">{row.dag}</td>
                <td className="py-2 pr-4 text-white/70">{row.n}</td>
                <td className="py-2 pr-4 text-white/70">
                  {row.blendApplied}/{row.n}
                </td>
                <td className={`py-2 pr-4 font-medium ${avgOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {row.avgConfidence !== null ? `${(row.avgConfidence * 100).toFixed(0)}%` : '—'}
                </td>
                <td className={`py-2 pr-4 font-medium ${minOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {row.minConfidence !== null ? `${(row.minConfidence * 100).toFixed(0)}%` : '—'}
                </td>
                <td className="max-w-xs truncate py-2 text-white/40">{sourceSummary || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentCalcTable({ calcs }: { calcs: RecentCalculation[] }) {
  if (calcs.length === 0) {
    return (
      <p className="text-sm italic text-white/40">
        Geen berekeningen met empirische data in de afgelopen 24 uur.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 pr-3 font-semibold text-white/40">Tijd</th>
            <th className="py-2 pr-3 font-semibold text-white/40">PC</th>
            <th className="py-2 pr-3 font-semibold text-white/40">Bron</th>
            <th className="py-2 pr-3 font-semibold text-white/40">Conf.</th>
            <th className="py-2 pr-3 font-semibold text-white/40">ρ L1</th>
            <th className="py-2 pr-3 font-semibold text-white/40">ρ Emp.</th>
            <th className="py-2 pr-3 font-semibold text-white/40">ρ Blend</th>
            <th className="py-2 font-semibold text-white/40">Blend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/8">
          {calcs.map((calc) => (
            <tr key={calc.id} className="hover:bg-white/5">
              <td className="py-1.5 pr-3 font-mono text-white/40">
                {new Date(calc.createdAt).toLocaleTimeString('nl-NL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="py-1.5 pr-3 font-mono text-white/70">{calc.postcode ?? '—'}</td>
              <td className="py-1.5 pr-3 font-mono text-white/50">
                {calc.empiricalSource.replace('l', 'L').replace('_', ' ')}
              </td>
              <td
                className={`py-1.5 pr-3 font-medium ${
                  calc.empiricalConfidence !== null && calc.empiricalConfidence >= 0.5
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                {calc.empiricalConfidence !== null
                  ? `${(calc.empiricalConfidence * 100).toFixed(0)}%`
                  : '—'}
              </td>
              <td className="py-1.5 pr-3 text-white/70">
                {calc.l1Rho !== null ? `${calc.l1Rho} Ω` : '—'}
              </td>
              <td className="py-1.5 pr-3 text-white/70">
                {calc.empiricalRho !== null ? `${calc.empiricalRho} Ω` : '—'}
              </td>
              <td className="py-1.5 pr-3 font-medium text-[#E8761A]">
                {calc.blendedRho !== null ? `${calc.blendedRho} Ω` : '—'}
              </td>
              <td className="py-1.5">
                {calc.blendApplied ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-white/30">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RollbackPanel({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 ${
        active ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-100">Emergency Rollback</h2>
          <p className="mt-0.5 text-xs text-white/45">
            {active
              ? 'Rollback is ACTIEF — alle berekeningen gebruiken L1.'
              : 'Niet actief. Gebruik dit bij onverwacht gedrag.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            active
              ? 'bg-red-600 text-white'
              : 'border border-white/15 text-white/70 hover:border-white/30 hover:text-white'
          }`}
        >
          {open ? 'Verberg instructies' : 'Toon instructies'}
        </button>
      </div>

      {open && (
        <div className="space-y-2 text-sm">
          <p className="text-white/70">
            Zet{' '}
            <code className="rounded bg-white/10 px-1 font-mono text-xs">EMERGENCY_ROLLBACK=true</code>{' '}
            in de omgevingsvariabelen van je deployment:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-black/40 px-4 py-3 font-mono text-xs text-emerald-400">
{`# Vercel / hosting platform
EMERGENCY_ROLLBACK=true

# Direct effect (geen herstart nodig in Next.js App Router)
# Alle berekeningen gebruiken automatisch L1 literatuurprior.
# Herstel: zet EMERGENCY_ROLLBACK=false of verwijder de variabele.`}
          </pre>
          <p className="text-xs text-white/40">
            Geen herstart nodig — de waarde wordt per request gelezen.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SoilMonitoringPage() {
  const [data, setData] = useState<SoilMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setData((await res.json()) as SoilMonitoringData);
      setLastFetch(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Instrumentatie"
        title="Soil Knowledge — Monitoring"
        description={
          <>
            Poort D staging — empirische blend van geleidende klasse
            {lastFetch && <> · bijgewerkt {lastFetch.toLocaleTimeString('nl-NL')}</>}
          </>
        }
        actions={
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="rounded-lg border border-[#E8761A]/40 px-4 py-2 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/10 disabled:opacity-50"
          >
            {loading ? 'Bezig…' : 'Vernieuwen'}
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Alarms</h2>
            <AlarmList alarms={data.alarms} />
          </div>

          <ConfigCard config={data.config} />

          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Dagelijks overzicht — laatste 14 dagen
            </h2>
            <DailyTable rows={data.dailyAggs} />
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Recente berekeningen met empirische data — afgelopen 24u
            </h2>
            <RecentCalcTable calcs={data.recentCalcs} />
          </div>

          <RollbackPanel active={data.config.emergencyRollback} />
        </>
      )}
    </div>
  );
}
