/**
 * Poort-2 shadow metrics — read-only over shadow_predictions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { outcomeHref } from '@/lib/moat/outcomes';

export type ShadowSummary = {
  unresolved: number;
  resolved: number;
  meanRelativeError: number | null;
  meanAbsoluteError: number | null;
  withL2: number;
  withL3: number;
  withL4: number;
};

export type ShadowRow = {
  id: string;
  calculation_id: string | null;
  href: string | null;
  posterior_mu: number | null;
  posterior_sigma: number | null;
  actual_rho: number | null;
  absolute_error: number | null;
  relative_error: number | null;
  l2_n: number | null;
  l3_n: number | null;
  l4_n: number | null;
  feat_bro_source: string | null;
  created_at: string | null;
  resolved: boolean;
};

export async function fetchShadowSummary(db: SupabaseClient): Promise<ShadowSummary> {
  const [{ count: unresolved }, { data: resolved }] = await Promise.all([
    db
      .from('shadow_predictions')
      .select('*', { count: 'exact', head: true })
      .is('actual_rho', null),
    db
      .from('shadow_predictions')
      .select('relative_error, absolute_error, l2_n, l3_n, l4_n')
      .not('actual_rho', 'is', null),
  ]);

  const rows = resolved ?? [];
  const n = rows.length;
  const meanRelativeError = n
    ? rows.reduce((s, r) => s + Number(r.relative_error ?? 0), 0) / n
    : null;
  const meanAbsoluteError = n
    ? rows.reduce((s, r) => s + Number(r.absolute_error ?? 0), 0) / n
    : null;

  return {
    unresolved: unresolved ?? 0,
    resolved: n,
    meanRelativeError,
    meanAbsoluteError,
    withL2: rows.filter(r => r.l2_n != null && Number(r.l2_n) > 0).length,
    withL3: rows.filter(r => r.l3_n != null && Number(r.l3_n) > 0).length,
    withL4: rows.filter(r => r.l4_n != null && Number(r.l4_n) > 0).length,
  };
}

export async function fetchShadowRows(
  db: SupabaseClient,
  opts: { resolved?: boolean; limit?: number } = {},
): Promise<ShadowRow[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  let q = db
    .from('shadow_predictions')
    .select(`
      id, calculation_id, posterior_mu, posterior_sigma, actual_rho,
      absolute_error, relative_error, l2_n, l3_n, l4_n,
      feat_bro_source, created_at
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.resolved === true) q = q.not('actual_rho', 'is', null);
  if (opts.resolved === false) q = q.is('actual_rho', null);

  const { data, error } = await q;
  if (error || !data) return [];

  return data.map(r => {
    const calcId = (r.calculation_id as string | null) ?? null;
    return {
      id: r.id as string,
      calculation_id: calcId,
      // Shadow rows are calc-linked; rapport preferred when available via confirmed flow
      href: outcomeHref(calcId, 'confirmed'),
      posterior_mu: r.posterior_mu == null ? null : Number(r.posterior_mu),
      posterior_sigma: r.posterior_sigma == null ? null : Number(r.posterior_sigma),
      actual_rho: r.actual_rho == null ? null : Number(r.actual_rho),
      absolute_error: r.absolute_error == null ? null : Number(r.absolute_error),
      relative_error: r.relative_error == null ? null : Number(r.relative_error),
      l2_n: r.l2_n == null ? null : Number(r.l2_n),
      l3_n: r.l3_n == null ? null : Number(r.l3_n),
      l4_n: r.l4_n == null ? null : Number(r.l4_n),
      feat_bro_source: (r.feat_bro_source as string | null) ?? null,
      created_at: (r.created_at as string | null) ?? null,
      resolved: r.actual_rho != null,
    };
  });
}
