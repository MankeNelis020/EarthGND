import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import {
  buildReadiness,
  ensureKlicRequestRow,
  loadKlicRequest,
  loadOwnedCalculation,
  loadProfilePolicy,
  toSnapshot,
} from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

const schema = z.object({
  referenceNumber: z.string().trim().min(3).max(64),
  requestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Manual external KLIC registration — always allowed (no API entitlement). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'KLIC-meldnummer is verplicht' }, { status: 400 });
  }

  const row = await ensureKlicRequestRow(supabase, uuid, user.id);

  if (['submitted', 'processing'].includes(row.status) && row.provider !== 'manual') {
    return NextResponse.json(
      { error: 'Er loopt al een API-aanvraag. Vernieuw de status of wacht op afronding.' },
      { status: 409 },
    );
  }

  const requestedAt = body.requestedAt
    ? new Date(`${body.requestedAt}T12:00:00.000Z`).toISOString()
    : new Date().toISOString();

  const { error } = await supabase
    .from('klic_requests')
    .update({
      provider: 'manual',
      status: 'ready',
      reference_number: body.referenceNumber.trim(),
      requested_at: requestedAt,
      requested_by: user.id,
      delivery_received_at: requestedAt,
      execution_date_at_submission: calc.planned_execution_date,
      last_status_checked_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message_safe: null,
      external_request_id: null,
      idempotency_key: `manual-${uuid}-${body.referenceNumber.trim()}`,
    })
    .eq('id', row.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [klic, policy, meting] = await Promise.all([
    loadKlicRequest(supabase, uuid, user.id),
    loadProfilePolicy(supabase, user.id),
    supabase.from('pendiepte_metingen').select('status').eq('calculation_id', uuid).maybeSingle(),
  ]);
  const policyEnabled = policy.klic_readiness_check_enabled !== false;

  return NextResponse.json({
    ok: true,
    request: {
      id: klic?.id,
      status: klic?.status,
      provider: 'manual',
      referenceNumber: klic?.reference_number,
      requestedAt: klic?.requested_at,
    },
    snapshot: toSnapshot(
      calc,
      klic,
      policyEnabled,
      (meting.data as { status?: string } | null)?.status ?? null,
    ),
    readiness: buildReadiness(calc, klic, policyEnabled),
  });
}
