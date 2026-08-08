import type { KlicProvider } from '@/lib/klic/provider';
import type {
  KlicConnectionResult,
  KlicRequestInput,
  KlicStatus,
  KlicStatusResult,
  KlicSubmissionResult,
} from '@/lib/klic/types';

/**
 * Deterministic mock for local/CI. Cycles: submitted → processing → ready.
 * Failure modes via externalRequestId prefix: auth-*, fail-*, cfg-*
 */
const mockState = new Map<string, { status: KlicStatus; ticks: number; ref: string }>();

export class DevMockKlicProvider implements KlicProvider {
  readonly id = 'dev_mock' as const;

  async validateConnection(): Promise<KlicConnectionResult> {
    return {
      ok: true,
      status: 'connected',
      accountReference: 'dev-mock-org',
    };
  }

  async submitRequest(input: KlicRequestInput): Promise<KlicSubmissionResult> {
    if (!input.plannedExecutionDate) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'DATE_INVALID',
        messageSafe: 'Geplande uitvoeringsdatum ontbreekt.',
      };
    }
    if (input.geometry && input.geometry.userConfirmed !== true) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'INVALID_GEOMETRY',
        messageSafe: 'Bevestig het graafgebied voordat je indient.',
      };
    }

    const externalRequestId = `mock-${input.idempotencyKey}`;
    const ref = `26G${String(Math.abs(hash(input.idempotencyKey)) % 1_000_000).padStart(6, '0')}`;
    mockState.set(externalRequestId, { status: 'submitted', ticks: 0, ref });

    return {
      ok: true,
      status: 'submitted',
      externalRequestId,
      referenceNumber: ref,
    };
  }

  async getStatus(externalRequestId: string): Promise<KlicStatusResult> {
    if (externalRequestId.startsWith('auth-')) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'AUTHENTICATION_REQUIRED',
        messageSafe: 'Authenticatie bij Kadaster vereist.',
      };
    }
    if (externalRequestId.startsWith('fail-')) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'PROVIDER_UNAVAILABLE',
        messageSafe: 'Kadaster tijdelijk niet bereikbaar.',
      };
    }
    if (externalRequestId.startsWith('cfg-')) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'ACCOUNT_CONFIGURATION_REQUIRED',
        messageSafe: 'Je Kadaster-account vereist aandacht.',
      };
    }

    const state = mockState.get(externalRequestId);
    if (!state) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'UNKNOWN_PROVIDER_ERROR',
        messageSafe: 'Onbekende mock-aanvraag.',
      };
    }

    state.ticks += 1;
    if (state.ticks >= 2) state.status = 'ready';
    else if (state.ticks >= 1) state.status = 'processing';

    return {
      ok: true,
      status: state.status,
      referenceNumber: state.ref,
      deliveryReceivedAt: state.status === 'ready' ? new Date().toISOString() : null,
    };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Test helper — reset in-memory mock store. */
export function resetDevMockKlicState(): void {
  mockState.clear();
}
