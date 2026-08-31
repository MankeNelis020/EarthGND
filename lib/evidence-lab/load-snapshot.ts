/**
 * Server-side Evidence Lab snapshot aggregator (read-mostly).
 */

import { moatServiceClient } from '@/lib/moat/admin-auth';
import { LITERATURE_PRIOR, GRIND_CLASS, MIN_SOFT_N_GLOBAL } from '@/lib/soil-knowledge/priors';
import { welfordToLevel } from '@/lib/soil-knowledge/bayesian-posterior';
import type { WelfordState } from '@/lib/soil-knowledge/types';
import {
  EARTHGND_LITHO_CLASSES,
  LITHO_LABELS,
  POORT3,
  computeAutoBayesianWeights,
  clusterSites,
  softNSiteAdjusted,
  buildCockpit,
  getProductionEmpiricalState,
  FORMULA_LIBRARY,
  defaultPolicy,
  resolveEffectiveEmpiricalPercent,
  runLeaveOneSiteOut,
  combineEvidenceStrength,
  scoreSampleStrength,
  scoreSiteIndependence,
  scoreGeographicCoverage,
  scoreMeasurementQuality,
  scoreGeotopConfidence,
  scoreOosPerformance,
  scoreUncertainty,
  mean,
  median,
  agreementFromRelativeErrorPct,
  type EmpiricalWeightPolicy,
  type Poort2Snapshot,
  type OosSiteObservation,
  type PolicyMode,
} from '@/lib/evidence-lab';

function asWelford(row: {
  welford_mean?: number | null;
  welford_m2?: number | null;
  total_weight?: number | null;
}): WelfordState {
  return {
    welford_mean: Number(row.welford_mean ?? 0),
    welford_m2: Number(row.welford_m2 ?? 0),
    total_weight: Number(row.total_weight ?? 0),
  };
}

function mapPolicyRow(row: Record<string, unknown> | null, lithoClass: number): EmpiricalWeightPolicy {
  if (!row) return defaultPolicy(lithoClass);
  return {
    lithoClass,
    mode: (row.mode as PolicyMode) ?? 'shadow',
    empiricalCapPercent: Number(row.empirical_cap_percent ?? 30),
    manualEmpiricalPercent: Number(row.manual_empirical_percent ?? 0),
    minSoftN: Number(row.min_soft_n ?? 5),
    minUniqueSites: Number(row.min_unique_sites ?? 3),
    minAgreementScore: Number(row.min_agreement_score ?? 0.55),
    poort3Required: row.poort3_required !== false,
    enabled: row.enabled === true,
    reviewedBy: (row.reviewed_by as string) ?? null,
    reviewedAt: (row.reviewed_at as string) ?? null,
    reason: (row.reason as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
  };
}

export async function loadEvidenceLabSnapshot() {
  const db = moatServiceClient();
  const notes: string[] = [];
  const production = getProductionEmpiricalState();

  const [
    shadowRes,
    globalRes,
    evidenceRes,
    metingRes,
    policyRes,
    geotopRes,
  ] = await Promise.all([
    db.from('shadow_predictions').select('id, absolute_error, relative_error, actual_rho, created_at'),
    db.from('global_prior').select('litho_class, welford_mean, welford_m2, total_weight'),
    db.from('soil_evidence').select('meting_id, depth_m, rho_apparent, zone, flagged_inconsistent, p_klei, p_leem, p_zand, p_grind, p_veen'),
    db.from('pendiepte_metingen').select('id, lat, lon, straatnaam, huisnummer, woonplaats, postcode, status, depth_curve, electrode_no, elektrode_diameter_mm, electrode_count, aantal_pennen').limit(500),
    db.from('empirical_weight_policy').select('*'),
    db.from('geotop_validation').select('earthgnd_litho_class, agreement_score, geotop_probability, relative_error_pct, site_cluster_id, meting_id').limit(5000),
  ]);

  if (shadowRes.error) notes.push(`shadow_predictions: ${shadowRes.error.message}`);
  if (globalRes.error) notes.push(`global_prior: ${globalRes.error.message}`);
  if (evidenceRes.error) notes.push(`soil_evidence: ${evidenceRes.error.message}`);
  if (metingRes.error) notes.push(`pendiepte_metingen: ${metingRes.error.message}`);
  if (policyRes.error) notes.push(`empirical_weight_policy: ${policyRes.error.message} — draai evidence_calibration_lab_migration.sql`);
  if (geotopRes.error) notes.push(`geotop_validation: ${geotopRes.error.message} — draai migratie / backfill`);

  const shadows = shadowRes.data ?? [];
  const groundTruthed = shadows.filter(s => s.actual_rho != null);
  const relErrs = groundTruthed
    .map(s => (s.relative_error != null ? Number(s.relative_error) * (Number(s.relative_error) <= 2 ? 100 : 1) : null))
    .filter((x): x is number => x != null && Number.isFinite(x));

  const poort2: Poort2Snapshot = {
    shadowCount: shadows.length,
    groundTruthedCount: groundTruthed.length,
    medianRelErrorPct: median(relErrs),
    depthGate: 'UNKNOWN',
    depthGeoMeanMax: null,
  };

  // Site clustering from metingen
  const metingen = metingRes.data ?? [];
  const sitePoints = metingen.map(m => ({
    id: m.id as string,
    lat: m.lat != null ? Number(m.lat) : null,
    lon: m.lon != null ? Number(m.lon) : null,
    siteKey:
      [m.straatnaam, m.huisnummer, m.woonplaats, m.postcode].filter(Boolean).join(', ') || null,
  }));
  const clusters = clusterSites(sitePoints);
  const metingToCluster = new Map<string, string>();
  for (const c of clusters) {
    for (const id of c.memberIds) metingToCluster.set(id, c.clusterId);
  }

  const globalByClass = new Map<number, ReturnType<typeof asWelford>>();
  for (const row of globalRes.data ?? []) {
    globalByClass.set(Number(row.litho_class), asWelford(row));
  }

  const policies = new Map<number, EmpiricalWeightPolicy>();
  for (const cls of EARTHGND_LITHO_CLASSES) {
    const row = (policyRes.data ?? []).find(r => Number(r.litho_class) === cls) as Record<string, unknown> | undefined;
    policies.set(cls, mapPolicyRow(row ?? null, cls));
  }

  // OOS observations: one rho per site per dominant litho from global evidence / meting median
  const oosObs: OosSiteObservation[] = [];
  const siteRhoByLitho = new Map<string, { lithoClass: number; rhos: number[] }>();

  for (const ev of evidenceRes.data ?? []) {
    if (ev.zone !== 'wet' || ev.flagged_inconsistent) continue;
    const rho = Number(ev.rho_apparent);
    if (!(rho > 0)) continue;
    const clusterId = metingToCluster.get(ev.meting_id as string) ?? `meting:${ev.meting_id}`;
    // Dominant soft class from stored P(k) — not a GeoTOP inference
    const probs: [number, number][] = [
      [1, Number(ev.p_klei ?? 0)],
      [2, Number(ev.p_leem ?? 0)],
      [3, Number(ev.p_zand ?? 0)],
      [4, Number(ev.p_grind ?? 0)],
      [5, Number(ev.p_veen ?? 0)],
    ];
    probs.sort((a, b) => b[1] - a[1]);
    const bestClass = (probs[0]?.[0] ?? 3) as number;
    const key = `${clusterId}::${bestClass}`;
    const cur = siteRhoByLitho.get(key) ?? { lithoClass: bestClass, rhos: [] };
    cur.rhos.push(rho);
    siteRhoByLitho.set(key, cur);
  }

  for (const [key, v] of Array.from(siteRhoByLitho.entries())) {
    const siteId = key.split('::')[0]!;
    const m = mean(v.rhos);
    if (m != null) oosObs.push({ siteId, lithoClass: v.lithoClass, actualRho: m });
  }

  const oos = oosObs.length >= 2 ? runLeaveOneSiteOut(oosObs) : null;

  const geotopRows = geotopRes.data ?? [];
  const geotopAgree = mean(
    geotopRows.map(r => Number(r.agreement_score)).filter(n => Number.isFinite(n)),
  );
  const geotopConf = mean(
    geotopRows
      .map(r => (r.geotop_probability != null ? Number(r.geotop_probability) : null))
      .filter((n): n is number => n != null && Number.isFinite(n)),
  );

  const lithologyCards = EARTHGND_LITHO_CLASSES.map(lithoClass => {
    const welford = globalByClass.get(lithoClass) ?? {
      welford_mean: 0,
      welford_m2: 0,
      total_weight: 0,
    };
    const empiricalLevel = welfordToLevel(welford, MIN_SOFT_N_GLOBAL);
    // Also expose raw even below threshold for Lab transparency
    const empiricalRaw =
      welford.total_weight > 0 && welford.welford_mean > 0
        ? {
            mu: welford.welford_mean,
            sigma:
              welford.total_weight > 1
                ? Math.sqrt(welford.welford_m2 / welford.total_weight)
                : LITERATURE_PRIOR[lithoClass]?.sigma ?? 15,
            n: welford.total_weight,
          }
        : null;

    const bayes = computeAutoBayesianWeights(lithoClass, empiricalLevel ?? empiricalRaw);

    const sitesForClass = oosObs.filter(o => o.lithoClass === lithoClass);
    const uniqueSites = new Set(sitesForClass.map(s => s.siteId)).size;
    const softN = welford.total_weight;
    const softNAdj = softNSiteAdjusted(softN, uniqueSites, Math.max(uniqueSites, softN));

    const geoForClass = geotopRows.filter(r => Number(r.earthgnd_litho_class) === lithoClass);
    const classAgree = mean(geoForClass.map(r => Number(r.agreement_score)).filter(Number.isFinite));
    const classRel = median(
      geoForClass
        .map(r => (r.relative_error_pct != null ? Number(r.relative_error_pct) : null))
        .filter((n): n is number => n != null),
    );

    const policy = policies.get(lithoClass)!;
    const effective = resolveEffectiveEmpiricalPercent(policy, bayes.autoEmpiricalWeight, {
      softN,
      uniqueSites,
      agreementScore: classAgree,
      poort3Passed: oos?.passedTechnical === true,
      soilKnowledgeActive: production.soilKnowledgeActive,
    });

    const theory = LITERATURE_PRIOR[lithoClass]!;

    return {
      lithoClass,
      label: LITHO_LABELS[lithoClass],
      learningBlocked: lithoClass === GRIND_CLASS,
      theory: {
        mu: theory.mu,
        sigma: theory.sigma,
        nVirtual: theory.nVirtual,
        source: 'L1 literature (priors.ts)',
      },
      empirical: {
        softN,
        softNSiteAdjusted: softNAdj,
        uniqueSites,
        mu: empiricalRaw?.mu ?? null,
        sigma: empiricalRaw?.sigma ?? null,
        belowThreshold: !empiricalLevel,
      },
      validation: {
        geotopPoints: geoForClass.length,
        meanAgreement: classAgree,
        medianRelErrorPct: classRel,
      },
      bayesian: {
        theoryPrecision: bayes.theoryPrecision,
        empiricalPrecision: bayes.empiricalPrecision,
        autoTheoryWeightPct: Math.round(bayes.autoTheoryWeight * 1000) / 10,
        autoEmpiricalWeightPct: Math.round(bayes.autoEmpiricalWeight * 1000) / 10,
        posteriorMu: bayes.posterior?.mu ?? theory.mu,
        posteriorSigma: bayes.posterior?.sigma ?? theory.sigma,
        note: bayes.note,
      },
      production: {
        empiricalPercent: production.productionEmpiricalPercent,
        activePriorMu: theory.mu,
        reason:
          production.productionEmpiricalPercent === 0
            ? 'Poort 3/4 — productie blijft L1 (SOIL_KNOWLEDGE_ACTIVE off of weight 0)'
            : production.subtext,
        policyEffective: effective,
      },
      layers: {
        theoryRho: theory.mu,
        bayesianPosteriorRho: bayes.posterior?.mu ?? theory.mu,
        productionActiveRho: theory.mu, // pinned: Lab does not claim live posterior
      },
    };
  });

  const totalSoftN = lithologyCards.reduce((s, c) => s + c.empirical.softN, 0);
  const totalSites = clusters.length;
  const strength = combineEvidenceStrength({
    sampleStrength: scoreSampleStrength(totalSoftN, POORT3.minSoftN),
    siteIndependence: scoreSiteIndependence(totalSites, Math.max(metingen.length, 1)),
    geographicCoverage: scoreGeographicCoverage(
      new Set(metingen.map(m => (m.woonplaats as string) || 'onbekend')).size,
    ),
    measurementQuality: scoreMeasurementQuality(
      (evidenceRes.data ?? []).filter(e => !e.flagged_inconsistent).length /
        Math.max(1, (evidenceRes.data ?? []).length),
    ),
    geotopConfidence: scoreGeotopConfidence(geotopConf ?? 0),
    oosPerformance: scoreOosPerformance(oos?.theoryMape ?? null, oos?.empiricalMape ?? null),
    uncertainty: scoreUncertainty(
      15,
      mean(lithologyCards.map(c => c.bayesian.posteriorSigma).filter(Number.isFinite)) ?? null,
    ),
  });

  const cockpit = buildCockpit({
    production,
    poort2,
    oos,
    evidenceStrength: strength,
    theoryEmpiricalAgreement01: geotopAgree ?? agreementFromRelativeErrorPct(poort2.medianRelErrorPct),
    policyEnabledAny: Array.from(policies.values()).some(p => p.enabled),
    humanApproved: false,
  });

  return {
    queriedAt: new Date().toISOString(),
    notes,
    cockpit,
    production,
    poort2,
    oos,
    strength,
    lithologyCards,
    formulas: FORMULA_LIBRARY,
    siteSummary: {
      metingCount: metingen.length,
      uniqueSites: clusters.length,
      clusterRadiusM: 75,
    },
    geotopSummary: {
      rowCount: geotopRows.length,
      meanAgreement: geotopAgree,
      meanConfidence: geotopConf,
    },
    policies: EARTHGND_LITHO_CLASSES.map(c => policies.get(c)!),
    safety: {
      productionPredictionUnchanged: true,
      statement: 'Production prediction behavior remains unchanged',
      soilKnowledgeActive: production.soilKnowledgeActive,
      productionEmpiricalPercent: production.productionEmpiricalPercent,
    },
  };
}

export type EvidenceLabSnapshot = Awaited<ReturnType<typeof loadEvidenceLabSnapshot>>;
