'use client';

import { useState, useEffect } from 'react';
import { grantAnalyticsConsent, revokeAnalyticsConsent } from '@/lib/analytics/gtm';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('earthgnd_analytics_consent') === null) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function accept() {
    grantAnalyticsConsent();
    window.dispatchEvent(new Event('earthgnd:consent-granted'));
    setVisible(false);
  }

  function decline() {
    revokeAnalyticsConsent();
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#252220] px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-white/60 leading-relaxed">
          EarthGND gebruikt analytische cookies om de tool te verbeteren — geen persoonlijke gegevens, geen advertenties.{' '}
          <a href="/nl/privacy" className="underline hover:text-white/90 transition-colors">
            Privacybeleid
          </a>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={decline}
            className="rounded-lg border border-white/20 px-4 py-2 text-xs text-white/60 hover:border-white/40 hover:text-white transition-colors"
          >
            Weigeren
          </button>
          <button
            onClick={accept}
            className="rounded-lg bg-[#E8761A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d4671a] transition-colors"
          >
            Accepteren
          </button>
        </div>
      </div>
    </div>
  );
}
