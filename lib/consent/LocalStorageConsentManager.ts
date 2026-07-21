import type { ConsentManager } from './ConsentManager';

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export class LocalStorageConsentManager implements ConsentManager {
  private readonly storageKey    = 'earthgnd_consent';
  private readonly bannerShownKey = 'earthgnd_consent_banner_shown';
  private readonly defaultState: Record<string, boolean> = {
    analytics:  false,
    marketing:  false,
    functional: true,
  };

  private getState(): Record<string, boolean> {
    if (typeof window === 'undefined') return { ...this.defaultState };
    const stored = localStorage.getItem(this.storageKey);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : { ...this.defaultState };
  }

  private setState(state: Record<string, boolean>): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  async grantConsent(category: string): Promise<void> {
    const state = this.getState();
    state[category] = true;
    this.setState(state);
    this.fireConsentEvent(true);
  }

  async revokeConsent(category: string): Promise<void> {
    const state = this.getState();
    state[category] = false;
    this.setState(state);
    this.fireConsentEvent(false);
  }

  hasConsent(category: string): boolean {
    return this.getState()[category] ?? false;
  }

  consentBannerShown(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(this.bannerShownKey) === 'true';
  }

  setConsentBannerShown(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.bannerShownKey, 'true');
  }

  getConsentState(): Record<string, boolean> {
    return this.getState();
  }

  fireConsentEvent(granted: boolean): void {
    if (typeof window === 'undefined') return;

    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({
      event:          'consent_updated',
      consent_granted: granted,
      consent_state:  this.getState(),
      timestamp:      new Date().toISOString(),
    });

    window.dispatchEvent(
      new CustomEvent('earthgnd:consent-granted', {
        detail: { categories: this.getState() },
      }),
    );
  }
}
