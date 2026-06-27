/**
 * Admin endpoint: verwerkt alle confirmed metingen opnieuw via processMeting.
 *
 * Gebruik:
 *   curl -X POST https://earthgnd.com/api/admin/reprocess-metingen \
 *        -H "x-import-key: <IMPORT_API_KEY>"
 *
 * Veilig om meerdere keren aan te roepen — processMeting overschrijft
 * soil_evidence via upsert (idempotent). Welford accumuleert WEL opnieuw
 * (dus 1× aanroepen per meting).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processMeting } from '@/lib/soil-knowledge/evidence-accumulator';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-import-key');
  if (!process.env.IMPORT_API_KEY || apiKey !== process.env.IMPORT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Reset Welford zodat we niet dubbel accumuleren
  const { error: resetError } = await admin
    .from('global_prior')
    .update({ total_weight: 0, welford_mean: 0, welford_m2: 0, posterior_mu: null, posterior_sigma: null })
    .gte('litho_class', 1);

  if (resetError) {
    return NextResponse.json({ error: 'Reset global_prior mislukt: ' + resetError.message }, { status: 500 });
  }

  const { error: resetRegError } = await admin
    .from('regional_prior')
    .delete()
    .gte('litho_class', 1);

  if (resetRegError) {
    return NextResponse.json({ error: 'Reset regional_prior mislukt: ' + resetRegError.message }, { status: 500 });
  }

  // Laad alle confirmed metingen
  const { data: metingen, error: fetchError } = await admin
    .from('pendiepte_metingen')
    .select('id')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: true });

  if (fetchError) {
    return NextResponse.json({ error: 'Laden metingen mislukt: ' + fetchError.message }, { status: 500 });
  }

  const results: { id: string; ok: boolean; error?: string; pointsProcessed?: number }[] = [];

  for (const m of (metingen ?? [])) {
    try {
      const result = await processMeting(m.id, admin);
      results.push({ id: m.id, ok: true, pointsProcessed: result.pointsProcessed });
    } catch (e) {
      results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed    = results.filter(r => !r.ok).length;

  return NextResponse.json({ ok: true, total: results.length, succeeded, failed, results });
}
