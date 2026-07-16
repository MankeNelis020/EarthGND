/**
 * GTM DataLayer utility — consent-gated, anonymous user identity.
 *
 * Rules:
 *   • Events are dropped when the user has not granted consent.
 *   • user_id is a random UUID in localStorage — never an email or postcode.
 *   • All pushEvent() calls are fire-and-forget; failures are silent.
 */

const CONSENT_KEY = 'earthgnd_analytics_consent';
const ANON_ID_KEY = 'earthgnd_anon_id';
const SESSION_KEY = 'earthgnd_session_id';

export type EarthGNDLocale = 'nl' | 'en';
export type EarthGNDDevice = 'mobile' | 'desktop';
export type EarthGNDEnv    = 'development' | 'staging' | 'production';

// ── Consent ────────────────────────────────────────────────────────────────────

export function hasAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CONSENT_KEY) === 'true';
}

export function grantAnalyticsConsent(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, 'true');
}

export function revokeAnalyticsConsent(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, 'false');
}

// ── Identity ───────────────────────────────────────────────────────────────────

function getAnonId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ── Environment ────────────────────────────────────────────────────────────────

function detectEnv(): EarthGNDEnv {
  if (typeof window === 'undefined') return 'production';
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'development';
  if (h.includes('staging') || h.includes('vercel.app')) return 'staging';
  return 'production';
}

function detectDevice(): EarthGNDDevice {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

// ── DataLayer ──────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export function pushEvent(
  eventName: string,
  payload:   Record<string, unknown> = {},
  locale:    EarthGNDLocale = 'nl',
): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;

  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({
      event:       eventName,
      timestamp:   new Date().toISOString(),
      user_id:     getAnonId(),
      session_id:  getSessionId(),
      environment: detectEnv(),
      locale,
      device:      detectDevice(),
      ...payload,
    });
  } catch {
    // Never let analytics crash the app
  }
}
