import type {
  KlicConnectionResult,
  KlicDeliveryResult,
  KlicProviderId,
  KlicRequestInput,
  KlicStatusResult,
  KlicSubmissionResult,
} from '@/lib/klic/types';
import { ManualKlicProvider } from '@/lib/klic/manual-provider';
import { DevMockKlicProvider } from '@/lib/klic/dev-mock-provider';
import { KadasterBmklProvider } from '@/lib/klic/kadaster/bmkl-provider';

export interface KlicProvider {
  readonly id: KlicProviderId;
  validateConnection(): Promise<KlicConnectionResult>;
  submitRequest(input: KlicRequestInput): Promise<KlicSubmissionResult>;
  getStatus(externalRequestId: string): Promise<KlicStatusResult>;
  getDelivery?(externalRequestId: string): Promise<KlicDeliveryResult>;
}

export function isBmklEnabled(): boolean {
  return process.env.KLIC_BMKL_ENABLED === 'true';
}

export function getProviderMode(): KlicProviderId {
  const mode = process.env.KLIC_PROVIDER_MODE;
  if (mode === 'kadaster_bmkl' && isBmklEnabled()) return 'kadaster_bmkl';
  if (mode === 'dev_mock') return 'dev_mock';
  return 'manual';
}

export function createKlicProvider(providerId?: KlicProviderId | null): KlicProvider {
  const id = providerId ?? getProviderMode();
  switch (id) {
    case 'kadaster_bmkl':
      if (!isBmklEnabled()) {
        // Hard guard: never call invented BMKL endpoints in production.
        return new ManualKlicProvider();
      }
      return new KadasterBmklProvider();
    case 'dev_mock':
      return new DevMockKlicProvider();
    case 'manual':
    default:
      return new ManualKlicProvider();
  }
}

export function canSubmitViaApi(opts: {
  entitled: boolean;
  integrationStatus: string | null | undefined;
  bmklEnabled?: boolean;
}): boolean {
  if (!opts.entitled) return false;
  if (!(opts.bmklEnabled ?? isBmklEnabled())) return false;
  return opts.integrationStatus === 'connected';
}
