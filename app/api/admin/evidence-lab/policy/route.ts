/**
 * POST /api/admin/evidence-lab/policy — review-only policy update + audit
 * Never flips SOIL_KNOWLEDGE_ACTIVE.
 */

import { NextResponse } from 'next/server';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { GRIND_CLASS } from '@/lib/soil-knowledge/priors';
import type { PolicyMode } from '@/lib/evidence-lab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null) as {
    lithoClass?: number;
    mode?: PolicyMode;
    enabled?: boolean;
    empiricalCapPercent?: number;
    manualEmpiricalPercent?: number;
    reason?: string;
    confirm?: boolean;
  } | null;

  if (!body?.lithoClass || !body.confirm || !body.reason?.trim()) {
    return NextResponse.json(
      { error: 'lithoClass, reason en confirm=true vereist' },
      { status: 400 },
    );
  }

  if (body.lithoClass === GRIND_CLASS && body.enabled) {
    return NextResponse.json(
      { error: 'Grind blijft geblokkeerd — enabled niet toegestaan' },
      { status: 400 },
    );
  }

  const db = moatServiceClient();
  const { data: prev, error: prevErr } = await db
    .from('empirical_weight_policy')
    .select('*')
    .eq('litho_class', body.lithoClass)
    .maybeSingle();

  if (prevErr) {
    return NextResponse.json(
      { error: prevErr.message, hint: 'Draai supabase/evidence_calibration_lab_migration.sql' },
      { status: 500 },
    );
  }

  const next = {
    mode: body.mode ?? prev?.mode ?? 'shadow',
    enabled: body.enabled ?? false,
    empirical_cap_percent: body.empiricalCapPercent ?? prev?.empirical_cap_percent ?? 30,
    manual_empirical_percent: body.manualEmpiricalPercent ?? prev?.manual_empirical_percent ?? 0,
    reviewed_by: auth.user.email ?? auth.user.id,
    reviewed_at: new Date().toISOString(),
    reason: body.reason.trim(),
    updated_at: new Date().toISOString(),
  };

  // Safety: enabling non-shadow modes still does not change live calc without env flag.
  if (next.enabled && next.mode !== 'shadow') {
    // Allow storing intent; Lab UI warns that SOIL_KNOWLEDGE_ACTIVE must stay off until ops decision.
  }

  const { data: saved, error } = await db
    .from('empirical_weight_policy')
    .upsert({ litho_class: body.lithoClass, ...next }, { onConflict: 'litho_class' })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await db.from('evidence_lab_audit').insert({
    action: 'policy_update',
    actor_email: auth.user.email ?? null,
    litho_class: body.lithoClass,
    previous_state: prev,
    new_state: saved,
    reason: body.reason.trim(),
  });

  return NextResponse.json({
    ok: true,
    policy: saved,
    warning:
      'Policy opgeslagen. Live productie blijft ongewijzigd tot SOIL_KNOWLEDGE_ACTIVE expliciet wordt gezet (buiten deze Lab).',
    safety: { productionPredictionUnchanged: true },
  });
}
