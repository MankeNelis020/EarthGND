'use client';

import { useEffect } from 'react';
import { getConsentManager } from '@/lib/consent/ConsentManager';

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

function injectGTM() {
  if (!GTM_ID || typeof window === 'undefined') return;
  if (document.getElementById('gtm-script')) return;

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  const s = document.createElement('script');
  s.id    = 'gtm-script';
  s.async = true;
  s.src   = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(s);
}

function hasAnalyticsConsent(): boolean {
  try {
    return getConsentManager().hasConsent('analytics');
  } catch {
    return false; // manager not yet initialized
  }
}

export function GTMLoader() {
  useEffect(() => {
    if (hasAnalyticsConsent()) injectGTM();

    const handler = () => {
      if (hasAnalyticsConsent()) injectGTM();
    };
    window.addEventListener('earthgnd:consent-granted', handler);
    return () => window.removeEventListener('earthgnd:consent-granted', handler);
  }, []);

  return null;
}
