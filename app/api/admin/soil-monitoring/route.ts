/**
 * GET /api/admin/soil-monitoring
 *
 * Monitoring-data voor Poort D dashboard:
 *   - Huidige feature-flag configuratie
 *   - Recente berekeningen met empirische blend (laatste 24u)
 *   - Dagelijkse aggregaten (laatste 14 dagen)
 *   - Actieve alarms
 *
 * Beveiligd: vereist ingelogde gebruiker, email in ADMIN_EMAILS.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface MonitoringConfig {
  soilKnowledgeActive: boolean;
  emergencyRollback:   boolean;
  empiricalWeight:     number;
  enabledClasses:      string;
  confidenceThreshold: number;
}

export interface DailyAggregate {
  dag:              string;   // ISO date
  n:                number;
  blendApplied:     number;
  avgConfidence:    number | null;
  minConfidence:    number | null;
  sources:          Record<string, number>; // source → count
}

export interface RecentCalculation {
  id:                  string;
  postcode:            string | null;
  empiricalSource:     string;
  empiricalConfidence: number | null;
  empiricalRho:        number | null;
  l1Rho:               number | null;
  blendedRho:          number | null;
  blendApplied:        boolean;
  createdAt:           string;
}

export interface Alarm {
  type:    'low_confidence' | 'no_activity' | 'rollback_active';
  message: string;
  dag?:    string;
}

export interface SoilMonitoringData {
  config:       MonitoringConfig;
  recentCalcs:  RecentCalculation[];
  dailyAggs:    DailyAggregate[];
  alarms:       Alarm[];
  queriedAt:    string;
}

export async function GET() {
  // Auth check
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  }

  const svc = getServiceClient();
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Huidige configuratie ──────────────────────────────────────────────────
  const config: MonitoringConfig = {
    soilKnowledgeActive: process.env.SOIL_KNOWLEDGE_ACTIVE === 'true',
    emergencyRollback:   process.env.EMERGENCY_ROLLBACK === 'true',
    empiricalWeight:     parseFloat(process.env.EMPIRICAL_WEIGHT ?? '0.1'),
    enabledClasses:      process.env.ENABLED_CLASSES ?? 'geleidend',
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.5'),
  };

  // ── Recente berekeningen (24u) met empirische data ────────────────────────
  const { data: rawRecent } = await svc
    .from('calculations')
    .select('id, postcode, result, created_at')
    .not('result->>empirical_source', 'is', null)
    .neq('result->>empirical_source', 'l1_literature')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(50);

  const recentCalcs: RecentCalculation[] = (rawRecent ?? []).map((r) => {
    const res = (r.result ?? {}) as Record<string, unknown>;
    return {
      id:                  r.id as string,
      postcode:            r.postcode as string | null,
      empiricalSource:     String(res.empirical_source ?? 'l1_literature'),
      empiricalConfidence: typeof res.empirical_confidence === 'number' ? res.empirical_confidence : null,
      empiricalRho:        typeof res.empirical_rho === 'number' ? res.empirical_rho : null,
      l1Rho:               typeof res.l1_rho === 'number' ? res.l1_rho : null,
      blendedRho:          typeof res.blended_rho === 'number' ? res.blended_rho : null,
      blendApplied:        Boolean(res.blend_applied),
      createdAt:           r.created_at as string,
    };
  });

  // ── 14-daagse aggregaten ──────────────────────────────────────────────────
  const { data: rawHistory } = await svc
    .from('calculations')
    .select('result, created_at')
    .not('result->>empirical_source', 'is', null)
    .neq('result->>empirical_source', 'l1_literature')
    .gte('created_at', since14d)
    .order('created_at', { ascending: false })
    .limit(2000);

  // Aggregeer per dag (client-side — geen RPC nodig)
  const byDay: Record<string, {
    n: number;
    blendApplied: number;
    confidences: number[];
    sources: Record<string, number>;
  }> = {};

  for (const row of (rawHistory ?? [])) {
    const res = (row.result ?? {}) as Record<string, unknown>;
    const dag = String(row.created_at).slice(0, 10);

    if (!byDay[dag]) byDay[dag] = { n: 0, blendApplied: 0, confidences: [], sources: {} };
    const agg = byDay[dag];
    agg.n++;
    if (res.blend_applied) agg.blendApplied++;
    if (typeof res.empirical_confidence === 'number') agg.confidences.push(res.empirical_confidence);
    const src = String(res.empirical_source ?? 'unknown');
    agg.sources[src] = (agg.sources[src] ?? 0) + 1;
  }

  const dailyAggs: DailyAggregate[] = Object.entries(byDay)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dag, agg]) => ({
      dag,
      n:             agg.n,
      blendApplied:  agg.blendApplied,
      avgConfidence: agg.confidences.length > 0
        ? agg.confidences.reduce((s, v) => s + v, 0) / agg.confidences.length
        : null,
      minConfidence: agg.confidences.length > 0
        ? Math.min(...agg.confidences)
        : null,
      sources:       agg.sources,
    }));

  // ── Alarms ────────────────────────────────────────────────────────────────
  const alarms: Alarm[] = [];

  if (config.emergencyRollback) {
    alarms.push({
      type:    'rollback_active',
      message: 'EMERGENCY_ROLLBACK=true is actief — alle berekeningen gebruiken L1.',
    });
  }

  // Alarm: geen activiteit afgelopen 48u (op staging → staging kapot?)
  if (config.soilKnowledgeActive && recentCalcs.length === 0) {
    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { count } = await svc
      .from('calculations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', last48h);
    if ((count ?? 0) === 0) {
      alarms.push({
        type:    'no_activity',
        message: 'Geen berekeningen in de afgelopen 48 uur — is staging operationeel?',
      });
    }
  }

  // Alarm: lage confidence op een dag (< 0.3 gemiddeld)
  for (const agg of dailyAggs.slice(0, 7)) {
    if (agg.avgConfidence !== null && agg.avgConfidence < 0.3) {
      alarms.push({
        type:    'low_confidence',
        message: `Lage gemiddelde confidence (${(agg.avgConfidence * 100).toFixed(0)}%) op ${agg.dag} — onderzoek nieuwe data.`,
        dag:     agg.dag,
      });
    }
  }

  return NextResponse.json({
    config,
    recentCalcs,
    dailyAggs,
    alarms,
    queriedAt: new Date().toISOString(),
  } satisfies SoilMonitoringData);
}
