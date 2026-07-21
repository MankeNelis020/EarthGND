/**
 * Swappable consent manager interface.
 * Swap the backend (localStorage → Cookiebot) by calling setConsentManager()
 * once at startup — no component changes needed.
 */

export interface ConsentManager {
  grantConsent(category: string): Promise<void>;
  revokeConsent(category: string): Promise<void>;
  hasConsent(category: string): boolean;
  consentBannerShown(): boolean;
  setConsentBannerShown(): void;
  getConsentState(): Record<string, boolean>;
  fireConsentEvent(granted: boolean): void;
}

let _manager: ConsentManager | null = null;

export function setConsentManager(manager: ConsentManager): void {
  _manager = manager;
}

export function getConsentManager(): ConsentManager {
  if (!_manager) throw new Error('ConsentManager not initialized — call setConsentManager() first');
  return _manager;
}
