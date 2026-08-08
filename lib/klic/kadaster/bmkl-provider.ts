import type { KlicProvider } from '@/lib/klic/provider';
import { KadasterBmklClient, BmklNotConfiguredError } from '@/lib/klic/kadaster/client';
import { normalizeKlicProviderError } from '@/lib/klic/kadaster/errors';
import type {
  KlicConnectionResult,
  KlicRequestInput,
  KlicStatusResult,
  KlicSubmissionResult,
} from '@/lib/klic/types';

/**
 * Production BMKL seam. Refuses live calls until official config is present.
 * Project logic must never depend on BMKL request details.
 */
export class KadasterBmklProvider implements KlicProvider {
  readonly id = 'kadaster_bmkl' as const;
  private client = new KadasterBmklClient();

  async validateConnection(): Promise<KlicConnectionResult> {
    if (!this.client.isConfigured()) {
      return {
        ok: false,
        status: 'configuration_required',
        errorCode: 'ACCOUNT_CONFIGURATION_REQUIRED',
        messageSafe: 'Kadaster BMKL is nog niet geconfigureerd voor live gebruik.',
      };
    }
    try {
      await this.client.request('/health');
      return { ok: true, status: 'connected' };
    } catch (err) {
      const n = normalizeKlicProviderError(err);
      return {
        ok: false,
        status: 'connection_error',
        errorCode: n.errorCode,
        messageSafe: n.messageSafe,
      };
    }
  }

  async submitRequest(input: KlicRequestInput): Promise<KlicSubmissionResult> {
    void input;
    try {
      if (!this.client.isConfigured()) throw new BmklNotConfiguredError();
      await this.client.request('/submit');
      // Unreachable until real client exists
      return { ok: false, status: 'failed', errorCode: 'PROVIDER_UNAVAILABLE', messageSafe: 'BMKL niet beschikbaar.' };
    } catch (err) {
      const n = normalizeKlicProviderError(err);
      return {
        ok: false,
        status: 'failed',
        errorCode: n.errorCode,
        messageSafe: n.messageSafe,
      };
    }
  }

  async getStatus(externalRequestId: string): Promise<KlicStatusResult> {
    void externalRequestId;
    try {
      if (!this.client.isConfigured()) throw new BmklNotConfiguredError();
      await this.client.request('/status');
      return { ok: false, status: 'failed', errorCode: 'PROVIDER_UNAVAILABLE', messageSafe: 'BMKL niet beschikbaar.' };
    } catch (err) {
      const n = normalizeKlicProviderError(err);
      return {
        ok: false,
        status: 'failed',
        errorCode: n.errorCode,
        messageSafe: n.messageSafe,
      };
    }
  }
}
