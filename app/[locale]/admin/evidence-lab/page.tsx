'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EvidenceLabSnapshot } from '@/lib/evidence-lab/load-snapshot';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { InstrumentGauge, WeightBar } from '@/components/evidence-lab/InstrumentGauge';
import { ManualSimulator } from '@/components/evidence-lab/ManualSimulator';
import { FormulaDrawer } from '@/components/evidence-lab/FormulaDrawer';

const GATE_LABEL: Record<string, string> = {
  POORT_2_SHADOW: 'POORT 2 — SHADOW',
  POORT_3_OOS_VALIDATION: 'POORT 3 — OOS VALIDATION',
  ELIGIBLE_FOR_REVIEW: 'ELIGIBLE FOR REVIEW',
  POORT_4_CONTROLLED_ACTIVATION: 'POORT 4 — CONTROLLED ACTIVATION',
  PRODUCTION_APPROVED: 'PRODUCTION APPROVED',
};

export default function EvidenceLabPage() {
  const [data, setData] = useState<EvidenceLabSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [jobMsg, setJobMsg] = useState('');
  const [wizardStep, setWizardStep] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/evidence-lab');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Laden mislukt');
        setData(null);
        return;
      }
      setData(json as EvidenceLabSnapshot);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runJob(jobType: string) {
    setJobMsg('Bezig…');
    try {
      const res = await fetch('/api/admin/evidence-lab/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, dryRun: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setJobMsg(json.error ?? 'Job mislukt');
        return;
      }
      setJobMsg(`${jobType}: dry-run ok`);
      await load();
    } catch {
      setJobMsg('Job verbindingsfout');
    }
  }

  if (loading) {
    return <p className="py-16 text-center text-white/50">Evidence Lab laden…</p>;
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-300">{error || 'Geen data'}</p>
        <p className="mt-4 text-sm text-white/40">Inloggen vereist · e-mail in ADMIN_EMAILS</p>
        <button type="button" onClick={() => void load()} className="mt-6 text-[#E8761A]">
          Opnieuw
        </button>
      </div>
    );
  }

  const { cockpit, lithologyCards, poort2, oos, strength, formulas, safety, notes, siteSummary, geotopSummary } =
    data;

  return (
    <div>
        <AdminPageHeader
          eyebrow="Instrumentatie"
          title="Evidence & Calibration Lab"
          description="Shadow → OOS → Controlled Activation. Theory, Bayesian AUTO en productie blijven gescheiden. Geen stille productie-wijzigingen."
          actions={
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-[#E8761A]/40 px-4 py-2 text-sm font-semibold text-[#E8761A] hover:bg-[#E8761A]/10"
            >
              Vernieuwen
            </button>
          }
        />

        {/* Safety banner */}
        <div className="mb-8 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
          <strong className="font-semibold">Production prediction behavior remains unchanged.</strong>
          {' '}
          Live empirisch: {safety.productionEmpiricalPercent}% · SOIL_KNOWLEDGE_ACTIVE=
          {String(safety.soilKnowledgeActive)}
        </div>

        {notes.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/80">
            {notes.map(n => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}

        {/* PART A — Cockpit */}
        <section className="mb-12">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Cockpit
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <InstrumentGauge
              label="Production empirical influence"
              value={cockpit.productionEmpiricalPercent}
              subtext={cockpit.productionSubtext}
              tone="ok"
            />
            <InstrumentGauge
              label="Validation readiness"
              value={cockpit.validationReadinessPercent}
              subtext={cockpit.gateStatusLevel.replaceAll('_', ' ')}
              tone="brand"
            />
            <InstrumentGauge
              label="Field evidence strength"
              value={cockpit.fieldEvidenceStrengthPercent}
              subtext="Multi-component — zie breakdown"
              tone="neutral"
            />
            <InstrumentGauge
              label="Theory ↔ empirical agreement"
              value={cockpit.theoryEmpiricalAgreementPercent}
              subtext="GeoTOP / shadow agreement"
              tone="neutral"
            />
            <div className="flex flex-col justify-center rounded-2xl border border-white/8 bg-[#141414] px-4 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Current gate
              </p>
              <p className="font-condensed mt-3 text-2xl font-black leading-tight text-[#E8761A]">
                {GATE_LABEL[cockpit.currentGate] ?? cockpit.currentGate}
              </p>
              <p className="mt-2 text-[11px] text-white/40">No automatic production approval</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cockpit.readinessBreakdown.map(b => (
              <div
                key={b.label}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  b.done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90'
                    : 'border-white/8 bg-white/[0.03] text-white/40'
                }`}
              >
                {b.done ? '✓' : '○'} {b.label}{' '}
                <span className="text-white/30">({b.weight}%)</span>
              </div>
            ))}
          </div>
        </section>

        {/* Five questions */}
        <section className="mb-12 grid gap-4 md:grid-cols-5">
          {[
            { q: '1. Theory?', a: 'L1 literature priors (priors.ts)' },
            { q: '2. Field?', a: `${siteSummary.uniqueSites} sites · soft_n in cards` },
            { q: '3. Trust?', a: 'Bayesian precision p = n/σ²' },
            {
              q: '4. Geology?',
              a: `${geotopSummary.rowCount} GeoTOP rows · agree ${
                geotopSummary.meanAgreement != null
                  ? (geotopSummary.meanAgreement * 100).toFixed(0) + '%'
                  : '—'
              }`,
            },
            {
              q: '5. Activate?',
              a: oos?.passedTechnical
                ? 'Technical OOS OK — human review required'
                : 'Not yet — Poort 3 pending',
            },
          ].map(item => (
            <div key={item.q} className="rounded-xl border border-white/8 bg-[#141414] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {item.q}
              </p>
              <p className="mt-2 text-sm text-white/80">{item.a}</p>
            </div>
          ))}
        </section>

        {/* Poort 2 */}
        <section className="mb-12">
          <h2 className="font-condensed text-2xl font-bold">Poort 2 — Shadow</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Metric label="Shadow predictions" value={String(poort2.shadowCount)} />
            <Metric label="Ground-truthed" value={String(poort2.groundTruthedCount)} />
            <Metric
              label="Median rel. error"
              value={
                poort2.medianRelErrorPct != null
                  ? `${poort2.medianRelErrorPct.toFixed(1)}%`
                  : '—'
              }
            />
            <Metric label="Depth gate" value={poort2.depthGate} />
          </div>
          <p className="mt-3 text-xs text-white/40">
            Hard dieptecriterium: <span className="font-mono">npm run gate:depth</span> (geoMean ≤
            1.30). Lab markeert depth gate UNKNOWN tot CLI resultaat is geïntegreerd.
          </p>
        </section>

        {/* Poort 3 OOS */}
        <section className="mb-12">
          <h2 className="font-condensed text-2xl font-bold">Poort 3 — OOS (leave-one-site-out)</h2>
          {!oos ? (
            <p className="mt-3 text-sm text-white/45">INSUFFICIENT DATA — te weinig sites voor holdout.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Metric label="Held-out sites" value={String(oos.heldOutSiteCount)} />
                <Metric
                  label="Theory MAE"
                  value={oos.theoryMae != null ? oos.theoryMae.toFixed(2) : '—'}
                />
                <Metric
                  label="Empirical MAE"
                  value={oos.empiricalMae != null ? oos.empiricalMae.toFixed(2) : '—'}
                />
                <Metric
                  label="Status"
                  value={oos.passedTechnical ? 'PASSING TECHNICAL' : oos.status}
                />
              </div>
              {oos.blockers.length > 0 && (
                <ul className="text-xs text-amber-200/80">
                  {oos.blockers.map(b => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-white/40">
                Poort 3 keurt productie NOOIT automatisch goed. CLI:{' '}
                <span className="font-mono">npm run gate:poort3-oos</span>
              </p>
            </div>
          )}
        </section>

        {/* Lithology cards + Bayes gauges */}
        <section className="mb-12">
          <h2 className="font-condensed text-2xl font-bold">Per-lithology evidence</h2>
          <div className="mt-6 space-y-6">
            {lithologyCards.map(card => (
              <article
                key={card.lithoClass}
                className="rounded-2xl border border-white/8 bg-[#141414] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-condensed text-3xl font-black uppercase tracking-tight">
                      {card.label}
                    </h3>
                    {card.learningBlocked && (
                      <p className="mt-1 text-xs font-semibold text-red-300">LEARNING BLOCKED</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-white/40">
                    <p>Production empirical: {card.production.empiricalPercent}%</p>
                    <p>{card.production.reason}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <WeightBar
                    theoryPct={card.bayesian.autoTheoryWeightPct}
                    empiricalPct={card.bayesian.autoEmpiricalWeightPct}
                  />
                  <p className="mt-2 text-[11px] text-white/35">{card.bayesian.note}</p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <LayerBox
                    title="Theory"
                    rho={card.layers.theoryRho}
                    detail={`σ=${card.theory.sigma} · nᵥ=${card.theory.nVirtual}`}
                  />
                  <LayerBox
                    title="Bayesian evidence posterior"
                    rho={card.layers.bayesianPosteriorRho}
                    detail={`AUTO emp ${card.bayesian.autoEmpiricalWeightPct}%`}
                    accent
                  />
                  <LayerBox
                    title="Production active"
                    rho={card.layers.productionActiveRho}
                    detail="L1 — Lab wijzigt dit niet"
                  />
                </div>

                <div className="mt-4 grid gap-3 text-xs text-white/55 sm:grid-cols-2 lg:grid-cols-4">
                  <p>
                    Precision theory {card.bayesian.theoryPrecision.toFixed(4)} · emp{' '}
                    {card.bayesian.empiricalPrecision.toFixed(4)}
                  </p>
                  <p>
                    soft_n {card.empirical.softN.toFixed(1)} · sites {card.empirical.uniqueSites} ·
                    soft_n* {card.empirical.softNSiteAdjusted.toFixed(1)}
                  </p>
                  <p>
                    GeoTOP n={card.validation.geotopPoints}
                    {card.validation.meanAgreement != null &&
                      ` · agree ${(card.validation.meanAgreement * 100).toFixed(0)}%`}
                  </p>
                  <p>
                    Policy: {card.production.policyEffective.mode}
                    {card.production.policyEffective.blockedReason
                      ? ` — ${card.production.policyEffective.blockedReason}`
                      : ''}
                  </p>
                </div>

                <div className="mt-5">
                  <ManualSimulator
                    label={card.label}
                    theoryRho={card.theory.mu}
                    empiricalRho={card.empirical.mu}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Evidence strength breakdown */}
        <section className="mb-12">
          <h2 className="font-condensed text-2xl font-bold">Evidence strength breakdown</h2>
          <p className="mt-1 text-xs text-white/40">{strength.formula}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(strength.components).map(([k, v]) => (
              <Metric key={k} label={k} value={`${v.toFixed(0)}`} />
            ))}
          </div>
        </section>

        {/* Activation wizard */}
        <section className="mb-12 rounded-2xl border border-white/8 bg-[#141414] p-5">
          <h2 className="font-condensed text-2xl font-bold">Activation wizard (review-only)</h2>
          <p className="mt-1 text-xs text-white/40">
            Geen automatische productie-activatie. Policy writes vereisen confirm + reason.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-white/70">
            {[
              `Poort 2 — shadow ${poort2.shadowCount}, GT ${poort2.groundTruthedCount}`,
              `GeoTOP — ${geotopSummary.rowCount} validatierijen`,
              `OOS — ${oos?.passedTechnical ? 'technical pass' : 'not passed'}`,
              'Bayesian AUTO weights — zie lithology cards',
              'Suggested cap — default 30% capped_auto',
              'Human approval — verplicht',
            ].map((step, i) => (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => setWizardStep(i)}
                  className={`text-left ${wizardStep === i ? 'text-[#E8761A]' : ''}`}
                >
                  {i + 1}. {step}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-amber-200/70">
            Blocking: grind altijd · Poort 3 fail · onvoldoende sites/soft_n · policy disabled
          </p>
        </section>

        {/* Jobs */}
        <section className="mb-12">
          <h2 className="font-condensed text-2xl font-bold">Admin jobs (dry-run default)</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                'run_poort2',
                'run_poort3_oos',
                'recompute_validation_aggregates',
                'backfill_geotop',
                'dry_run_activation',
              ] as const
            ).map(j => (
              <button
                key={j}
                type="button"
                onClick={() => void runJob(j)}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/80 hover:border-[#E8761A]/50"
              >
                {j}
              </button>
            ))}
          </div>
          {jobMsg && <p className="mt-3 text-xs text-white/45">{jobMsg}</p>}
        </section>

        {/* Formulas */}
        <section className="mb-12">
          <h2 className="font-condensed text-2xl font-bold">Formulas</h2>
          <div className="mt-4 rounded-2xl border border-white/8 bg-[#141414] px-5">
            {formulas.map(f => (
              <FormulaDrawer key={f.id} entry={f} />
            ))}
          </div>
        </section>

        <footer className="border-t border-white/8 pt-6 text-xs text-white/35">
          Queried {data.queriedAt} · unique sites {siteSummary.uniqueSites} / metingen{' '}
          {siteSummary.metingCount} · cluster radius {siteSummary.clusterRadiusM} m
        </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#141414] px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="font-condensed mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function LayerBox({
  title,
  rho,
  detail,
  accent,
}: {
  title: string;
  rho: number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ? 'border-[#E8761A]/35 bg-[#E8761A]/10' : 'border-white/8 bg-black/20'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{title}</p>
      <p className="font-condensed mt-1 text-2xl font-black tabular-nums">
        {typeof rho === 'number' ? rho.toFixed(1) : rho}{' '}
        <span className="text-sm font-semibold text-white/40">Ω·m</span>
      </p>
      <p className="mt-1 text-[11px] text-white/45">{detail}</p>
    </div>
  );
}
