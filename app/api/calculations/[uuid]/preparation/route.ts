import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import {
  buildReadiness,
  loadKlicRequest,
  loadOwnedCalculation,
  loadProfilePolicy,
  toSnapshot,
} from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

const patchSchema = z.object({
  plannedExecutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  confirmExecutionDate: z.boolean().optional(),
  contractorNotificationStatus: z
    .enum(['not_sent', 'sent', 'manually_confirmed'])
    .optional(),
  klicOverride: z
    .object({
      acknowledge: z.literal(true),
      reason: z.string().max(500).optional(),
    })
    .optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });

  const [klic, policy, meting] = await Promise.all([
    loadKlicRequest(supabase, uuid, user.id),
    loadProfilePolicy(supabase, user.id),
    supabase
      .from('pendiepte_metingen')
      .select('status')
      .eq('calculation_id', uuid)
      .maybeSingle(),
  ]);

  const policyEnabled = policy.klic_readiness_check_enabled !== false;
  const readiness = buildReadiness(calc, klic, policyEnabled);
  const snapshot = toSnapshot(
    calc,
    klic,
    policyEnabled,
    (meting.data as { status?: string } | null)?.status ?? null,
  );

  return NextResponse.json({ snapshot, readiness, plan: policy.plan });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Ongeldige invoer' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.plannedExecutionDate !== undefined) {
    const next = body.plannedExecutionDate;
    updates.planned_execution_date = next;
    // Changing date invalidates previous confirmation
    if (next !== calc.planned_execution_date) {
      updates.execution_date_confirmed_at = null;
      updates.execution_date_confirmed_by = null;
    }

    // Mark KLIC attention if submitted date no longer matches
    const klic = await loadKlicRequest(supabase, uuid, user.id);
    if (
      klic &&
      klic.execution_date_at_submission &&
      next &&
      next !== klic.execution_date_at_submission &&
      ['ready', 'submitted', 'processing'].includes(klic.status)
    ) {
      await supabase
        .from('klic_requests')
        .update({
          status: 'attention_required',
          last_error_code: 'DATE_CHANGED_AFTER_SUBMISSION',
          last_error_message_safe:
            'Uitvoeringsdatum gewijzigd na KLIC-indiening — controleer de melding.',
        })
        .eq('id', klic.id)
        .eq('user_id', user.id);
    }
  }

  if (body.confirmExecutionDate === true) {
    const date = (updates.planned_execution_date as string | null | undefined)
      ?? calc.planned_execution_date;
    if (!date) {
      return NextResponse.json(
        { error: 'Stel eerst een uitvoeringsdatum in' },
        { status: 400 },
      );
    }
    updates.execution_date_confirmed_at = new Date().toISOString();
    updates.execution_date_confirmed_by = user.id;
  }

  if (body.contractorNotificationStatus) {
    updates.contractor_notification_status = body.contractorNotificationStatus;
    if (
      body.contractorNotificationStatus === 'sent' ||
      body.contractorNotificationStatus === 'manually_confirmed'
    ) {
      updates.contractor_notified_at = new Date().toISOString();
      updates.contractor_notified_by = user.id;
    } else {
      updates.contractor_notified_at = null;
      updates.contractor_notified_by = null;
    }
  }

  if (body.klicOverride) {
    updates.klic_override_at = new Date().toISOString();
    updates.klic_override_by = user.id;
    updates.klic_override_reason = body.klicOverride.reason ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 });
  }

  const { error } = await supabase
    .from('calculations')
    .update(updates)
    .eq('id', uuid)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const refreshed = await loadOwnedCalculation(supabase, uuid, user.id);
  const [klic, policy, meting] = await Promise.all([
    loadKlicRequest(supabase, uuid, user.id),
    loadProfilePolicy(supabase, user.id),
    supabase
      .from('pendiepte_metingen')
      .select('status')
      .eq('calculation_id', uuid)
      .maybeSingle(),
  ]);

  const policyEnabled = policy.klic_readiness_check_enabled !== false;
  return NextResponse.json({
    snapshot: toSnapshot(
      refreshed!,
      klic,
      policyEnabled,
      (meting.data as { status?: string } | null)?.status ?? null,
    ),
    readiness: buildReadiness(refreshed!, klic, policyEnabled),
  });
}
