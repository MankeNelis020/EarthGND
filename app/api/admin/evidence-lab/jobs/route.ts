/**
 * POST /api/admin/evidence-lab/jobs — safe admin jobs (dry-run default)
 */

import { NextResponse } from 'next/server';
import { requireMoatAdmin, moatServiceClient } from '@/lib/moat/admin-auth';
import { loadEvidenceLabSnapshot } from '@/lib/evidence-lab/load-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JobType =
  | 'backfill_geotop'
  | 'recompute_soil_evidence'
  | 'recompute_validation_aggregates'
  | 'run_poort2'
  | 'run_poort3_oos'
  | 'dry_run_activation';

export async function POST(req: Request) {
  const auth = await requireMoatAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null) as {
    jobType?: JobType;
    dryRun?: boolean;
  } | null;

  if (!body?.jobType) {
    return NextResponse.json({ error: 'jobType vereist' }, { status: 400 });
  }

  const dryRun = body.dryRun !== false; // default true
  const db = moatServiceClient();

  const { data: jobRow } = await db
    .from('evidence_lab_jobs')
    .insert({
      job_type: body.jobType,
      status: 'running',
      dry_run: dryRun,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  try {
    let summary: Record<string, unknown> = {};

    if (body.jobType === 'run_poort3_oos' || body.jobType === 'dry_run_activation') {
      const snap = await loadEvidenceLabSnapshot();
      summary = {
        oos: snap.oos,
        cockpit: snap.cockpit,
        dryRun,
        note:
          body.jobType === 'dry_run_activation'
            ? 'Dry-run only — geen SOIL_KNOWLEDGE_ACTIVE wijziging'
            : 'OOS leave-one-site-out samenvatting',
      };
    } else if (body.jobType === 'run_poort2') {
      const snap = await loadEvidenceLabSnapshot();
      summary = { poort2: snap.poort2, note: 'Shadow metrics; dieptegate via npm run gate:depth' };
    } else if (body.jobType === 'backfill_geotop') {
      summary = {
        dryRun,
        note: dryRun
          ? 'Dry-run: zou GeoTOP validatierijen upserten voor metingen met lat/lon. Zet dryRun=false om te schrijven.'
          : 'Live backfill nog via scripts/evidence-lab-geotop-backfill.ts — API markeert job voor operator.',
      };
      if (!dryRun) {
        // Intentionally conservative: full network backfill is a dedicated script.
        summary.queued = true;
      }
    } else if (body.jobType === 'recompute_soil_evidence') {
      summary = {
        dryRun,
        note: 'Gebruik bestaande POST /api/admin/reprocess-metingen met import key. Lab job logt intentie alleen.',
      };
    } else if (body.jobType === 'recompute_validation_aggregates') {
      const snap = await loadEvidenceLabSnapshot();
      summary = { geotopSummary: snap.geotopSummary, strength: snap.strength };
    } else {
      return NextResponse.json({ error: 'Onbekende jobType' }, { status: 400 });
    }

    if (jobRow?.id) {
      await db
        .from('evidence_lab_jobs')
        .update({
          status: 'done',
          summary,
          finished_at: new Date().toISOString(),
        })
        .eq('id', jobRow.id);
    }

    await db.from('evidence_lab_audit').insert({
      action: `job:${body.jobType}`,
      actor_email: auth.user.email ?? null,
      new_state: summary,
      reason: dryRun ? 'dry_run' : 'execute',
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      summary,
      safety: { productionPredictionUnchanged: true },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'job failed';
    if (jobRow?.id) {
      await db
        .from('evidence_lab_jobs')
        .update({ status: 'error', error: message, finished_at: new Date().toISOString() })
        .eq('id', jobRow.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
