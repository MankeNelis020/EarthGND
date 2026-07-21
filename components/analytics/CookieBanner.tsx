'use client';

import { useState, useEffect } from 'react';
import { getConsentManager } from '@/lib/consent/ConsentManager';

export function CookieBanner() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // By the time effects run, Providers has initialized the ConsentManager.
    if (!getConsentManager().consentBannerShown()) {
      setShown(true);
    }
  }, []);

  if (!shown) return null;

  async function accept() {
    const manager = getConsentManager();
    await manager.grantConsent('analytics');
    manager.setConsentBannerShown();
    setShown(false);
  }

  async function decline() {
    const manager = getConsentManager();
    await manager.revokeConsent('analytics');
    manager.setConsentBannerShown();
    setShown(false);
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
