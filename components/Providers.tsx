'use client';

import type { ReactNode } from 'react';
import { CalculatorProvider } from '@/lib/context/CalculatorContext';
import { setConsentManager } from '@/lib/consent/ConsentManager';
import { LocalStorageConsentManager } from '@/lib/consent/LocalStorageConsentManager';

// Initialize once when the module is first executed client-side.
// Module-level runs synchronously, before any useEffect, so all child
// components (CookieBanner, GTMLoader) can safely call getConsentManager().
if (typeof window !== 'undefined') {
  setConsentManager(new LocalStorageConsentManager());
}

export function Providers({ children }: { children: ReactNode }) {
  return <CalculatorProvider>{children}</CalculatorProvider>;
}
