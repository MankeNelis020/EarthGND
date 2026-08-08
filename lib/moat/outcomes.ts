/**
 * Outcome drill-down — list confirmed/installed metingen with calculation links.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type OutcomeFilter = {
  region?: string | null;
  weekStart?: string | null; // ISO date YYYY-MM-DD (Monday)
  category?: string | null; // excellent|good|acceptable|miss|unknown|unlinked
  unlinkedOnly?: boolean;
  limit?: number;
};

export type OutcomeRow = {
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
  measurement_quality: string | null;
  is_outlier: boolean;
  knowledge_processed_at: string | null;
  confirmed_at: string | null;
  created_at: string | null;
};

/** User-facing path for a meting (uuid in routes = calculation_id). */
export function outcomeHref(
  calculationId: string | null | undefined,
  status: string | null | undefined,
): string | null {
  if (!calculationId) return null;
  if (status === 'confirmed' || status === 'submitted') {
    return `/pendiepte-rapport/${calculationId}`;
  }
  return `/meting/${calculationId}`;
}

function mondayEndIso(weekStart: string): string | null {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}

export async function fetchMoatOutcomes(
  db: SupabaseClient,
  filter: OutcomeFilter = {},
): Promise<OutcomeRow[]> {
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));

  let q = db
    .from('pendiepte_metingen')
    .select(`
      id, calculation_id, status, postcode, straatnaam, huisnummer, woonplaats,
      installed_depth, predicted_depth_m, depth_error_percent,
      prediction_accuracy_category, regional_cluster_id, measurement_quality,
      is_outlier, knowledge_processed_at, confirmed_at, submitted_at, created_at
    `)
    .or('status.eq.confirmed,installed_depth.not.is.null')
    .order('confirmed_at', { ascending: false, nullsFirst: false })
    .limit(limit * 2); // oversample before JS week filter

  if (filter.region) {
    q = q.eq('regional_cluster_id', filter.region);
  }

  if (filter.unlinkedOnly || filter.category === 'unlinked') {
    q = q.is('predicted_depth_m', null);
  } else if (filter.category === 'unknown') {
    q = q.or('prediction_accuracy_category.eq.unknown,prediction_accuracy_category.is.null');
  } else if (
    filter.category === 'excellent'
    || filter.category === 'good'
    || filter.category === 'acceptable'
    || filter.category === 'miss'
  ) {
    q = q.eq('prediction_accuracy_category', filter.category);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  const weekStart = filter.weekStart?.trim() || null;
  const weekEnd = weekStart ? mondayEndIso(weekStart) : null;

  return data
    .filter(row => {
      if (!weekStart || !weekEnd) return true;
      const raw = row.confirmed_at ?? row.submitted_at ?? row.created_at;
      if (!raw) return false;
      const t = new Date(raw).toISOString();
      return t >= `${weekStart}T00:00:00.000Z` && t < weekEnd;
    })
    .slice(0, limit)
    .map(row => ({
      id: row.id as string,
      calculation_id: (row.calculation_id as string | null) ?? null,
      href: outcomeHref(row.calculation_id as string | null, row.status as string | null),
      status: (row.status as string | null) ?? null,
      postcode: (row.postcode as string | null) ?? null,
      straatnaam: (row.straatnaam as string | null) ?? null,
      huisnummer: (row.huisnummer as string | null) ?? null,
      woonplaats: (row.woonplaats as string | null) ?? null,
      installed_depth:
        row.installed_depth == null ? null : Number(row.installed_depth),
      predicted_depth_m:
        row.predicted_depth_m == null ? null : Number(row.predicted_depth_m),
      depth_error_percent:
        row.depth_error_percent == null ? null : Number(row.depth_error_percent),
      prediction_accuracy_category:
        (row.prediction_accuracy_category as string | null) ?? null,
      regional_cluster_id: (row.regional_cluster_id as string | null) ?? null,
      measurement_quality: (row.measurement_quality as string | null) ?? null,
      is_outlier: Boolean(row.is_outlier),
      knowledge_processed_at: (row.knowledge_processed_at as string | null) ?? null,
      confirmed_at: (row.confirmed_at as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
    }));
}
