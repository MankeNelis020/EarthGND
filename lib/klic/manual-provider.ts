import type { KlicProvider } from '@/lib/klic/provider';
import type {
  KlicConnectionResult,
  KlicRequestInput,
  KlicStatusResult,
  KlicSubmissionResult,
} from '@/lib/klic/types';

/** Manual registration path — EarthGND does not call Kadaster. */
export class ManualKlicProvider implements KlicProvider {
  readonly id = 'manual' as const;

  async validateConnection(): Promise<KlicConnectionResult> {
    return {
      ok: false,
      status: 'disconnected',
      messageSafe: 'Manual provider has no Kadaster connection.',
    };
  }

  async submitRequest(input: KlicRequestInput): Promise<KlicSubmissionResult> {
    void input;
    return {
      ok: false,
      status: 'failed',
      errorCode: 'ACCOUNT_CONFIGURATION_REQUIRED',
      messageSafe: 'Gebruik handmatige registratie of koppel Kadaster (wanneer beschikbaar).',
    };
  }

  async getStatus(externalRequestId: string): Promise<KlicStatusResult> {
    void externalRequestId;
    return {
      ok: false,
      status: 'failed',
      errorCode: 'PROVIDER_UNAVAILABLE',
      messageSafe: 'Handmatige meldingen hebben geen externe statusfeed.',
    };
  }
}
