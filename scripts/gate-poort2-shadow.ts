/**
 * Poort 2 — shadow_predictions health check.
 *
 * Vereist SUPABASE env + toegepaste soil_knowledge_schema.
 * Zonder DB: exit 0 (skip) — bedoeld voor handmatige/staging gate runs.
 */

import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('gate:poort2 SKIP — geen Supabase env (staging/productie only)');
    process.exit(0);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { count: unresolved } = await supabase
    .from('shadow_predictions')
    .select('*', { count: 'exact', head: true })
    .is('actual_rho', null);

  const { data: resolved, error } = await supabase
    .from('shadow_predictions')
    .select('relative_error, absolute_error')
    .not('actual_rho', 'is', null);

  if (error) {
    console.error('gate:poort2 ERROR:', error.message);
    process.exit(1);
  }

  const n = resolved?.length ?? 0;
  const meanRel = n
    ? resolved!.reduce((s, r) => s + (r.relative_error ?? 0), 0) / n
    : null;

  console.log(`Shadow unresolved: ${unresolved ?? 0}`);
  console.log(`Shadow with ground truth: ${n}`);
  if (meanRel != null) console.log(`Mean relative error (posterior vs actual_rho): ${(meanRel * 100).toFixed(1)}%`);

  console.log('gate:poort2 PASSED (informational — see docs/phased-gates.md)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
