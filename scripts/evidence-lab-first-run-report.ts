/**
 * First real Evidence Lab run report — read-only.
 * Does not flip SOIL_KNOWLEDGE_ACTIVE or change production.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { LITERATURE_PRIOR, GRIND_CLASS, MIN_SOFT_N_GLOBAL } from '@/lib/soil-knowledge/priors';
import { welfordToLevel } from '@/lib/soil-knowledge/bayesian-posterior';
import type { WelfordState } from '@/lib/soil-knowledge/types';
import {
  EARTHGND_LITHO_CLASSES,
  LITHO_LABELS,
  computeAutoBayesianWeights,
  clusterSites,
  softNSiteAdjusted,
  runLeaveOneSiteOut,
  getProductionEmpiricalState,
  median,
  mean,
  percentile,
  type OosSiteObservation,
} from '@/lib/evidence-lab';
import { isSoilKnowledgeActive } from '@/lib/soil-knowledge/sheet-sync';

function loadEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

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

async function main() {
  const env = loadEnv();
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  // Explicitly keep production off for this process
  delete process.env.SOIL_KNOWLEDGE_ACTIVE;
  delete process.env.EMPIRICAL_WEIGHT;

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const production = getProductionEmpiricalState();
  console.log('=== SAFETY ===');
  console.log('SOIL_KNOWLEDGE_ACTIVE', isSoilKnowledgeActive(), '(env=', env.SOIL_KNOWLEDGE_ACTIVE ?? 'unset', ')');
  console.log('productionEmpiricalPercent', production.productionEmpiricalPercent);
  console.log(production.subtext);

  const [
    { data: globalRows },
    { data: evidence },
    { data: metingen },
    { data: shadows },
    { data: geotopRows, count: geotopCount, error: geotopErr },
    { count: policyCount, error: policyErr },
  ] = await Promise.all([
    db.from('global_prior').select('litho_class, welford_mean, welford_m2, total_weight'),
    db.from('soil_evidence').select(
      'meting_id, depth_m, rho_apparent, zone, flagged_inconsistent, p_klei, p_leem, p_zand, p_grind, p_veen',
    ),
    db.from('pendiepte_metingen').select(
      'id, lat, lon, straatnaam, huisnummer, woonplaats, postcode, status, depth_curve, electrode_no, electrode_count, aantal_pennen, elektrode_diameter_mm',
    ),
    db.from('shadow_predictions').select('id, actual_rho, relative_error, absolute_error'),
    db.from('geotop_validation').select(
      'earthgnd_litho_class, agreement_score, geotop_probability, relative_error_pct, site_cluster_id, meting_id',
    ),
    db.from('empirical_weight_policy').select('litho_class', { count: 'exact', head: true }),
  ]);

  console.log('\n=== DATA INVENTORY ===');
  console.log('global_prior', globalRows?.length ?? 0);
  console.log('soil_evidence', evidence?.length ?? 0);
  console.log('pendiepte_metingen', metingen?.length ?? 0);
  console.log('shadow_predictions', shadows?.length ?? 0);
  console.log('geotop_validation', geotopErr?.message ?? `rows=${geotopRows?.length ?? 0} count=${geotopCount}`);
  console.log('empirical_weight_policy', policyErr?.message ?? `count=${policyCount}`);

  const sitePoints = (metingen ?? []).map(m => ({
    id: m.id as string,
    lat: m.lat != null ? Number(m.lat) : null,
    lon: m.lon != null ? Number(m.lon) : null,
    siteKey:
      [m.straatnaam, m.huisnummer, m.woonplaats, m.postcode].filter(Boolean).join(', ') || null,
  }));
  const clusters = clusterSites(sitePoints);
  const metingToCluster = new Map<string, string>();
  for (const c of clusters) for (const id of c.memberIds) metingToCluster.set(id, c.clusterId);

  const electrodeCountTotal = (metingen ?? []).reduce((s, m) => {
    const n = Number(m.electrode_count ?? m.aantal_pennen ?? 1);
    return s + (Number.isFinite(n) && n > 0 ? n : 1);
  }, 0);

  const groundTruthed = (shadows ?? []).filter(s => s.actual_rho != null);
  console.log('\n=== POORT 2 (shadow) ===');
  console.log('shadowCount', shadows?.length ?? 0);
  console.log('groundTruthed', groundTruthed.length);
  const rel = groundTruthed
    .map(s => (s.relative_error != null ? Number(s.relative_error) : null))
    .filter((x): x is number => x != null)
    .map(x => (x <= 2 ? x * 100 : x));
  console.log('medianRelErrorPct', median(rel));

  // Per-lithology evidence from wet soil_evidence using stored soft P(k)
  const byLithoRhos = new Map<number, { rhos: number[]; metingIds: Set<string>; siteIds: Set<string> }>();
  for (const cls of EARTHGND_LITHO_CLASSES) {
    byLithoRhos.set(cls, { rhos: [], metingIds: new Set(), siteIds: new Set() });
  }

  function dominantClass(ev: Record<string, unknown>): number {
    const probs: [number, number][] = [
      [1, Number(ev.p_klei ?? 0)],
      [2, Number(ev.p_leem ?? 0)],
      [3, Number(ev.p_zand ?? 0)],
      [4, Number(ev.p_grind ?? 0)],
      [5, Number(ev.p_veen ?? 0)],
    ];
    probs.sort((a, b) => b[1] - a[1]);
    return probs[0]?.[0] ?? 3;
  }

  for (const ev of evidence ?? []) {
    if (ev.zone !== 'wet' || ev.flagged_inconsistent) continue;
    const rho = Number(ev.rho_apparent);
    if (!(rho > 0)) continue;
    const best = dominantClass(ev as Record<string, unknown>);
    const bucket = byLithoRhos.get(best)!;
    bucket.rhos.push(rho);
    bucket.metingIds.add(ev.meting_id as string);
    bucket.siteIds.add(metingToCluster.get(ev.meting_id as string) ?? `meting:${ev.meting_id}`);
  }

  const globalByClass = new Map<number, WelfordState>();
  for (const row of globalRows ?? []) {
    globalByClass.set(Number(row.litho_class), asWelford(row));
  }

  // OOS — site medians per dominant class
  const oosObs: OosSiteObservation[] = [];
  for (const lithoClass of EARTHGND_LITHO_CLASSES) {
    const bySite = new Map<string, number[]>();
    for (const ev of evidence ?? []) {
      if (ev.zone !== 'wet' || ev.flagged_inconsistent) continue;
      const rho = Number(ev.rho_apparent);
      if (!(rho > 0)) continue;
      if (dominantClass(ev as Record<string, unknown>) !== lithoClass) continue;
      const siteId = metingToCluster.get(ev.meting_id as string) ?? `meting:${ev.meting_id}`;
      const list = bySite.get(siteId) ?? [];
      list.push(rho);
      bySite.set(siteId, list);
    }
    for (const [siteId, rhos] of Array.from(bySite.entries())) {
      const m = mean(rhos);
      if (m != null) oosObs.push({ siteId: `${siteId}::${lithoClass}`, lithoClass, actualRho: m });
    }
  }
  const oos = oosObs.length >= 2 ? runLeaveOneSiteOut(oosObs) : null;

  console.log('\n=== POORT 3 OOS ===');
  if (!oos) console.log('INSUFFICIENT DATA');
  else {
    console.log({
      heldOutSites: oos.heldOutSiteCount,
      folds: oos.folds.length,
      theoryMae: oos.theoryMae,
      empiricalMae: oos.empiricalMae,
      theoryMape: oos.theoryMape,
      empiricalMape: oos.empiricalMape,
      passedTechnical: oos.passedTechnical,
      status: oos.status,
      blockers: oos.blockers,
    });
  }

  console.log('\n=== SITE INDEPENDENCE ===');
  console.log({
    metingen: metingen?.length ?? 0,
    electrodeCountProxy: electrodeCountTotal,
    uniqueSites: clusters.length,
  });

  console.log('\n=== PER-LITHOLOGY REPORT ===');
  for (const lithoClass of EARTHGND_LITHO_CLASSES) {
    const theory = LITERATURE_PRIOR[lithoClass]!;
    const welford = globalByClass.get(lithoClass) ?? {
      welford_mean: 0,
      welford_m2: 0,
      total_weight: 0,
    };
    const bucket = byLithoRhos.get(lithoClass)!;
    const rhos = bucket.rhos;
    const empiricalLevel = welfordToLevel(welford, MIN_SOFT_N_GLOBAL);
    const empiricalRaw =
      welford.total_weight > 0 && welford.welford_mean > 0
        ? {
            mu: welford.welford_mean,
            sigma:
              welford.total_weight > 1
                ? Math.sqrt(welford.welford_m2 / welford.total_weight)
                : theory.sigma,
            n: welford.total_weight,
          }
        : null;
    const bayes = computeAutoBayesianWeights(lithoClass, empiricalLevel ?? empiricalRaw);
    const uniqueSites = bucket.siteIds.size;
    const softN = welford.total_weight;
    const geoForClass = (geotopRows ?? []).filter(
      r => Number(r.earthgnd_litho_class) === lithoClass,
    );
    const classAgree = mean(
      geoForClass.map(r => Number(r.agreement_score)).filter(n => Number.isFinite(n)),
    );
    const classGeotopConf = mean(
      geoForClass
        .map(r => (r.geotop_probability != null ? Number(r.geotop_probability) : null))
        .filter((n): n is number => n != null && Number.isFinite(n)),
    );
    const blockers: string[] = [];
    if (lithoClass === GRIND_CLASS) blockers.push('LEARNING BLOCKED — grind');
    if (softN < 5) blockers.push(`soft_n ${softN.toFixed(2)} < 5`);
    if (uniqueSites < 3) blockers.push(`unique sites ${uniqueSites} < 3`);
    if (!oos?.passedTechnical) blockers.push('Poort 3 OOS not passed');
    if (!(geotopRows?.length)) blockers.push('geotop_validation empty');
    if (classAgree != null && classAgree < 0.55) {
      blockers.push(`GeoTOP agreement ${classAgree.toFixed(2)} < 0.55`);
    }
    blockers.push('PRODUCTION remains theory-only (SOIL_KNOWLEDGE_ACTIVE off)');

    const report = {
      lithology: LITHO_LABELS[lithoClass],
      lithoClass,
      theory: { mu: theory.mu, sigma: theory.sigma, nVirtual: theory.nVirtual },
      rawObservations: rhos.length,
      electrodeCountProxy: Array.from(bucket.metingIds).reduce((s, id) => {
        const m = (metingen ?? []).find(x => x.id === id);
        const n = Number(m?.electrode_count ?? m?.aantal_pennen ?? 1);
        return s + (Number.isFinite(n) && n > 0 ? n : 1);
      }, 0),
      uniqueSites,
      soft_n: softN,
      soft_n_site_adjusted: softNSiteAdjusted(softN, uniqueSites, Math.max(uniqueSites, softN)),
      geotopValidationCoverage: {
        rows: geoForClass.length,
        meanAgreement: classAgree,
        meanGeotopProbability: classGeotopConf,
      },
      empirical: {
        mu: empiricalRaw?.mu ?? (rhos.length ? mean(rhos) : null),
        median: rhos.length ? median(rhos) : null,
        sigma: empiricalRaw?.sigma ?? null,
        p10: rhos.length ? percentile(rhos, 10) : null,
        p90: rhos.length ? percentile(rhos, 90) : null,
      },
      bayesian: {
        theoryPrecision: bayes.theoryPrecision,
        empiricalPrecision: bayes.empiricalPrecision,
        autoTheoryPct: Math.round(bayes.autoTheoryWeight * 1000) / 10,
        autoEmpiricalPct: Math.round(bayes.autoEmpiricalWeight * 1000) / 10,
        posteriorMu: bayes.posterior?.mu ?? theory.mu,
        posteriorSigma: bayes.posterior?.sigma ?? theory.sigma,
      },
      agreementScore: classAgree,
      poort2: {
        shadowCount: shadows?.length ?? 0,
        groundTruthed: groundTruthed.length,
        status: groundTruthed.length > 0 ? 'SHADOW_ACTIVE_WITH_GROUND_TRUTH' : 'SHADOW_ONLY_OR_EMPTY',
      },
      poort3: oos
        ? { status: oos.status, passedTechnical: oos.passedTechnical, blockers: oos.blockers }
        : { status: 'INSUFFICIENT_DATA' },
      blockers,
      production: {
        theoryPct: 100 - production.productionEmpiricalPercent,
        empiricalPct: production.productionEmpiricalPercent,
      },
    };
    console.log('\n---', report.lithology, '---');
    console.log(JSON.stringify(report, null, 2));
  }

  console.log('\n=== EXPLICIT VERIFICATION ===');
  console.log('SOIL_KNOWLEDGE_ACTIVE remains OFF:', !isSoilKnowledgeActive());
  console.log('Production empirical influence remains 0%:', production.productionEmpiricalPercent === 0);
  console.log('Production prediction behavior remains unchanged');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
