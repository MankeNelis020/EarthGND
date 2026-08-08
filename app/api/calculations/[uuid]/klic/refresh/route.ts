import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createKlicProvider } from '@/lib/klic/provider';
import type { KlicProviderId } from '@/lib/klic/types';
import {
  buildReadiness,
  loadKlicRequest,
  loadOwnedCalculation,
  loadProfilePolicy,
  toSnapshot,
} from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });

  const klic = await loadKlicRequest(supabase, uuid, user.id);
  if (!klic) return NextResponse.json({ error: 'Geen KLIC-aanvraag' }, { status: 404 });

  if (klic.provider === 'manual') {
    return NextResponse.json({
      ok: true,
      request: {
        status: klic.status,
        referenceNumber: klic.reference_number,
        provider: 'manual',
      },
      note: 'manual',
    });
  }

  if (!klic.external_request_id) {
    return NextResponse.json({ error: 'Geen extern verzoek om te vernieuwen' }, { status: 400 });
  }

  const provider = createKlicProvider(klic.provider as KlicProviderId);
  const result = await provider.getStatus(klic.external_request_id);

  if (!result.ok) {
    await supabase
      .from('klic_requests')
      .update({
        last_status_checked_at: new Date().toISOString(),
        last_error_code: result.errorCode ?? 'UNKNOWN_PROVIDER_ERROR',
        last_error_message_safe: result.messageSafe ?? null,
      })
      .eq('id', klic.id)
      .eq('user_id', user.id);

    return NextResponse.json(
      { error: result.messageSafe, code: result.errorCode },
      { status: 502 },
    );
  }

  // Do not silently clear attention if execution date diverged
  let nextStatus = result.status;
  if (
    klic.execution_date_at_submission &&
    calc.planned_execution_date &&
    klic.execution_date_at_submission !== calc.planned_execution_date
  ) {
    nextStatus = 'attention_required';
  }

  await supabase
    .from('klic_requests')
    .update({
      status: nextStatus,
      reference_number: result.referenceNumber ?? klic.reference_number,
      delivery_received_at: result.deliveryReceivedAt ?? klic.delivery_received_at,
      last_status_checked_at: new Date().toISOString(),
      last_error_code: nextStatus === 'attention_required' ? 'DATE_CHANGED_AFTER_SUBMISSION' : null,
      last_error_message_safe:
        nextStatus === 'attention_required'
          ? 'Uitvoeringsdatum gewijzigd na KLIC-indiening — controleer de melding.'
          : null,
    })
    .eq('id', klic.id)
    .eq('user_id', user.id);

  const [fresh, policy, meting] = await Promise.all([
    loadKlicRequest(supabase, uuid, user.id),
    loadProfilePolicy(supabase, user.id),
    supabase.from('pendiepte_metingen').select('status').eq('calculation_id', uuid).maybeSingle(),
  ]);
  const policyEnabled = policy.klic_readiness_check_enabled !== false;

  return NextResponse.json({
    ok: true,
    request: {
      status: fresh?.status,
      referenceNumber: fresh?.reference_number,
      provider: fresh?.provider,
    },
    snapshot: toSnapshot(
      calc,
      fresh,
      policyEnabled,
      (meting.data as { status?: string } | null)?.status ?? null,
    ),
    readiness: buildReadiness(calc, fresh, policyEnabled),
  });
}
