import type { KlicRequestInput, KlicStatus } from '@/lib/klic/types';

/**
 * Map EarthGND domain input → future BMKL payload shape.
 * Intentionally minimal until official specs are available.
 */
export function mapToBmklSubmitPayload(input: KlicRequestInput): Record<string, unknown> {
  return {
    earthgnd_calculation_id: input.calculationId,
    planned_execution_date: input.plannedExecutionDate,
    address_label: input.addressLabel,
    postcode: input.postcode ?? null,
    geometry_present: !!input.geometry,
    geometry_user_confirmed: input.geometry?.userConfirmed === true,
    work_description: input.workDescription ?? 'Aardelektrode installeren',
    idempotency_key: input.idempotencyKey,
  };
}

export function mapBmklStatusToKlicStatus(raw: string | undefined | null): KlicStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'ready':
    case 'delivered':
    case 'gereed':
      return 'ready';
    case 'processing':
    case 'in_behandeling':
      return 'processing';
    case 'submitted':
    case 'aangevraagd':
      return 'submitted';
    case 'failed':
    case 'fout':
      return 'failed';
    default:
      return 'processing';
  }
}
