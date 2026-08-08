import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateProjectReadiness } from '@/lib/work-preparation/readiness';
import type {
  ContractorNotificationStatus,
  PreparationSnapshot,
  ProjectReadiness,
} from '@/lib/work-preparation/types';
import type { KlicStatus } from '@/lib/klic/types';

export type CalcPrepRow = {
  id: string;
  user_id: string;
  tool: string;
  postcode: string | null;
  rapport_naam: string | null;
  result: unknown;
  planned_execution_date: string | null;
  execution_date_confirmed_at: string | null;
  execution_date_confirmed_by: string | null;
  contractor_notification_status: ContractorNotificationStatus;
  contractor_notified_at: string | null;
  contractor_notified_by: string | null;
  klic_override_at: string | null;
  klic_override_by: string | null;
  klic_override_reason: string | null;
};

export type KlicRequestRow = {
  id: string;
  calculation_id: string;
  user_id: string;
  provider: string;
  status: KlicStatus;
  external_request_id: string | null;
  reference_number: string | null;
  requested_at: string | null;
  requested_by: string | null;
  delivery_received_at: string | null;
  execution_date_at_submission: string | null;
  last_status_checked_at: string | null;
  last_error_code: string | null;
  last_error_message_safe: string | null;
  geometry: unknown;
  idempotency_key: string | null;
};

export type ProfileKlicPolicy = {
  plan: string;
  company_name: string | null;
  klic_readiness_check_enabled: boolean;
  klic_check_disabled_at: string | null;
};

const CALC_PREP_SELECT = [
  'id', 'user_id', 'tool', 'postcode', 'rapport_naam', 'result',
  'planned_execution_date', 'execution_date_confirmed_at', 'execution_date_confirmed_by',
  'contractor_notification_status', 'contractor_notified_at', 'contractor_notified_by',
  'klic_override_at', 'klic_override_by', 'klic_override_reason',
].join(', ');

export async function loadOwnedCalculation(
  supabase: SupabaseClient,
  calculationId: string,
  userId: string,
): Promise<CalcPrepRow | null> {
  const { data } = await supabase
    .from('calculations')
    .select(CALC_PREP_SELECT)
    .eq('id', calculationId)
    .eq('user_id', userId)
    .eq('tool', 'diepte')
    .maybeSingle();
  return (data as CalcPrepRow | null) ?? null;
}

export async function loadKlicRequest(
  supabase: SupabaseClient,
  calculationId: string,
  userId: string,
): Promise<KlicRequestRow | null> {
  const { data } = await supabase
    .from('klic_requests')
    .select('*')
    .eq('calculation_id', calculationId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as KlicRequestRow | null) ?? null;
}

export async function loadProfilePolicy(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileKlicPolicy> {
  const { data } = await supabase
    .from('profiles')
    .select('plan, company_name, klic_readiness_check_enabled, klic_check_disabled_at')
    .eq('id', userId)
    .maybeSingle();
  return {
    plan: (data as ProfileKlicPolicy | null)?.plan ?? 'gratis',
    company_name: (data as ProfileKlicPolicy | null)?.company_name ?? null,
    klic_readiness_check_enabled:
      (data as ProfileKlicPolicy | null)?.klic_readiness_check_enabled ?? true,
    klic_check_disabled_at:
      (data as ProfileKlicPolicy | null)?.klic_check_disabled_at ?? null,
  };
}

export async function ensureKlicRequestRow(
  supabase: SupabaseClient,
  calculationId: string,
  userId: string,
): Promise<KlicRequestRow> {
  const existing = await loadKlicRequest(supabase, calculationId, userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('klic_requests')
    .upsert(
      {
        calculation_id: calculationId,
        user_id: userId,
        provider: 'manual',
        status: 'not_started',
      },
      { onConflict: 'calculation_id', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (error || !data) {
    const again = await loadKlicRequest(supabase, calculationId, userId);
    if (again) return again;
    throw new Error(error?.message ?? 'klic_requests upsert failed');
  }
  return data as KlicRequestRow;
}

export function buildReadiness(
  calc: CalcPrepRow,
  klic: KlicRequestRow | null,
  policyEnabled: boolean,
): ProjectReadiness {
  return calculateProjectReadiness({
    hasCalculationResult: calc.result != null,
    contractorNotificationStatus: calc.contractor_notification_status ?? 'not_sent',
    plannedExecutionDate: calc.planned_execution_date,
    executionDateConfirmedAt: calc.execution_date_confirmed_at,
    klicStatus: klic?.status ?? 'not_started',
    policyEnabled,
    executionDateAtSubmission: klic?.execution_date_at_submission,
    hasKlicOverride: !!calc.klic_override_at,
  });
}

export function toSnapshot(
  calc: CalcPrepRow,
  klic: KlicRequestRow | null,
  policyEnabled: boolean,
  metingStatus: string | null,
): PreparationSnapshot {
  return {
    calculationId: calc.id,
    rapportNaam: calc.rapport_naam,
    postcode: calc.postcode,
    plannedExecutionDate: calc.planned_execution_date,
    executionDateConfirmedAt: calc.execution_date_confirmed_at,
    contractorNotificationStatus: calc.contractor_notification_status ?? 'not_sent',
    contractorNotifiedAt: calc.contractor_notified_at,
    klicOverrideAt: calc.klic_override_at,
    klicStatus: klic?.status ?? 'not_started',
    klicReferenceNumber: klic?.reference_number ?? null,
    klicProvider: klic?.provider ?? null,
    executionDateAtSubmission: klic?.execution_date_at_submission ?? null,
    klicRequestedAt: klic?.requested_at ?? null,
    policyEnabled,
    metingStatus,
  };
}

/** Public integration view — never expose credential references. */
export function sanitizeIntegration(row: Record<string, unknown> | null) {
  if (!row) {
    return {
      status: 'disconnected' as const,
      provider: 'manual',
      providerAccountReference: null,
      lastVerifiedAt: null,
      lastErrorCode: null,
      connected: false,
    };
  }
  return {
    status: row.status,
    provider: row.provider,
    providerAccountReference: row.provider_account_reference ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
    lastErrorCode: row.last_error_code ?? null,
    connected: row.status === 'connected',
  };
}
