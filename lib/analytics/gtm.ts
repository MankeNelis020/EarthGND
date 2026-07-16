/**
 * GTM DataLayer utility — consent-gated, anonymous user identity.
 *
 * Consent source of truth: ConsentManager (lib/consent).
 * All pushEvent() calls are fire-and-forget; failures are silent.
 */

import { getConsentManager } from '@/lib/consent/ConsentManager';

export type EarthGNDLocale = 'nl' | 'en';
export type EarthGNDDevice = 'mobile' | 'desktop';
export type EarthGNDEnv    = 'development' | 'staging' | 'production';

const ANON_ID_KEY = 'earthgnd_anon_id';
const SESSION_KEY = 'earthgnd_session_id';

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

  try {
    if (!getConsentManager().hasConsent('analytics')) return;
  } catch {
    return; // manager not yet initialized — safe no-op
  }

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
