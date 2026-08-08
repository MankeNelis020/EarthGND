import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { canUseFeature } from '@/lib/entitlements';
import { canSubmitViaApi, createKlicProvider, isBmklEnabled } from '@/lib/klic/provider';
import { safeMessageForKlicError } from '@/lib/klic/kadaster/errors';
import {
  buildReadiness,
  ensureKlicRequestRow,
  loadKlicRequest,
  loadOwnedCalculation,
  loadProfilePolicy,
  sanitizeIntegration,
  toSnapshot,
} from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

const submitSchema = z.object({
  locationConfirmed: z.literal(true),
  workDescription: z.string().max(300).optional(),
  geometry: z
    .object({
      type: z.enum(['Point', 'Polygon', 'unknown']),
      coordinates: z.array(z.number()).or(z.array(z.array(z.number()))).optional(),
      userConfirmed: z.boolean().optional(),
      label: z.string().optional(),
    })
    .optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });

  const klic = await loadKlicRequest(supabase, uuid, user.id);
  return NextResponse.json({
    request: klic
      ? {
          id: klic.id,
          status: klic.status,
          provider: klic.provider,
          referenceNumber: klic.reference_number,
          requestedAt: klic.requested_at,
          executionDateAtSubmission: klic.execution_date_at_submission,
          lastErrorCode: klic.last_error_code,
          lastErrorMessageSafe: klic.last_error_message_safe,
          lastStatusCheckedAt: klic.last_status_checked_at,
        }
      : null,
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });

  if (!calc.planned_execution_date) {
    return NextResponse.json(
      { error: 'Stel eerst een uitvoeringsdatum in', code: 'DATE_INVALID' },
      { status: 400 },
    );
  }

  let body: z.infer<typeof submitSchema>;
  try {
    body = submitSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Bevestig locatie en graafgebied' }, { status: 400 });
  }

  const policy = await loadProfilePolicy(supabase, user.id);
  const entitled = canUseFeature(policy.plan, 'klic_api_integration');

  const { data: integration } = await supabase
    .from('klic_integrations')
    .select('status, provider, provider_account_reference, last_verified_at, last_error_code')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!canSubmitViaApi({
    entitled,
    integrationStatus: (integration as { status?: string } | null)?.status,
    bmklEnabled: isBmklEnabled() || process.env.KLIC_PROVIDER_MODE === 'dev_mock',
  }) && process.env.KLIC_PROVIDER_MODE !== 'dev_mock') {
    return NextResponse.json(
      {
        error: safeMessageForKlicError(
          entitled ? 'ACCOUNT_CONFIGURATION_REQUIRED' : 'FEATURE_NOT_ENTITLED',
        ),
        code: entitled ? 'ACCOUNT_CONFIGURATION_REQUIRED' : 'FEATURE_NOT_ENTITLED',
        integration: sanitizeIntegration(integration as Record<string, unknown> | null),
      },
      { status: entitled ? 403 : 402 },
    );
  }

  const existing = await ensureKlicRequestRow(supabase, uuid, user.id);

  // Idempotency / duplicate guard
  if (['submitted', 'processing', 'ready'].includes(existing.status)) {
    return NextResponse.json(
      {
        error: safeMessageForKlicError('DUPLICATE_SUBMISSION'),
        code: 'DUPLICATE_SUBMISSION',
        request: {
          id: existing.id,
          status: existing.status,
          referenceNumber: existing.reference_number,
        },
      },
      { status: 409 },
    );
  }

  const idempotencyKey =
    body.idempotencyKey ?? `klic-${uuid}-${calc.planned_execution_date}`;

  if (existing.idempotency_key === idempotencyKey && existing.external_request_id) {
    return NextResponse.json({
      ok: true,
      request: {
        id: existing.id,
        status: existing.status,
        referenceNumber: existing.reference_number,
      },
    });
  }

  // Lock row early to reduce double-submit races
  const { data: locked, error: lockErr } = await supabase
    .from('klic_requests')
    .update({
      status: 'submitted',
      idempotency_key: idempotencyKey,
      last_error_code: null,
      last_error_message_safe: null,
    })
    .eq('id', existing.id)
    .eq('user_id', user.id)
    .in('status', ['not_started', 'failed', 'attention_required', 'manual_pending'])
    .select('*')
    .maybeSingle();

  if (lockErr) return NextResponse.json({ error: lockErr.message }, { status: 500 });
  if (!locked) {
    return NextResponse.json(
      {
        error: safeMessageForKlicError('DUPLICATE_SUBMISSION'),
        code: 'DUPLICATE_SUBMISSION',
      },
      { status: 409 },
    );
  }

  const providerMode =
    process.env.KLIC_PROVIDER_MODE === 'dev_mock'
      ? 'dev_mock'
      : isBmklEnabled()
        ? 'kadaster_bmkl'
        : 'manual';

  const provider = createKlicProvider(providerMode);
  const result = await provider.submitRequest({
    calculationId: uuid,
    userId: user.id,
    plannedExecutionDate: calc.planned_execution_date,
    addressLabel: calc.rapport_naam ?? calc.postcode ?? uuid.slice(0, 8),
    postcode: calc.postcode,
    geometry: body.geometry
      ? { ...body.geometry, userConfirmed: body.geometry.userConfirmed ?? body.locationConfirmed }
      : { type: 'unknown', userConfirmed: body.locationConfirmed, label: calc.postcode ?? undefined },
    workDescription: body.workDescription ?? 'Aardelektrode installeren',
    idempotencyKey,
  });

  if (!result.ok) {
    await supabase
      .from('klic_requests')
      .update({
        status: 'failed',
        provider: provider.id,
        last_error_code: result.errorCode ?? 'UNKNOWN_PROVIDER_ERROR',
        last_error_message_safe: result.messageSafe ?? safeMessageForKlicError('UNKNOWN_PROVIDER_ERROR'),
        idempotency_key: null,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id);

    return NextResponse.json(
      {
        error: result.messageSafe,
        code: result.errorCode,
        actionRequired: result.actionRequired,
      },
      { status: 502 },
    );
  }

  await supabase
    .from('klic_requests')
    .update({
      status: result.status,
      provider: provider.id,
      external_request_id: result.externalRequestId ?? null,
      reference_number: result.referenceNumber ?? null,
      requested_at: new Date().toISOString(),
      requested_by: user.id,
      execution_date_at_submission: calc.planned_execution_date,
      last_status_checked_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message_safe: null,
      geometry: body.geometry ?? null,
      idempotency_key: idempotencyKey,
    })
    .eq('id', existing.id)
    .eq('user_id', user.id);

  const [klic, meting] = await Promise.all([
    loadKlicRequest(supabase, uuid, user.id),
    supabase.from('pendiepte_metingen').select('status').eq('calculation_id', uuid).maybeSingle(),
  ]);
  const policyEnabled = policy.klic_readiness_check_enabled !== false;

  return NextResponse.json({
    ok: true,
    request: {
      id: klic?.id,
      status: klic?.status,
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
