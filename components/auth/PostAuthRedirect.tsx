'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function PostAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Monteur klikte "Opslaan & sluiten" — niet terugsturen naar de meting
    if (sessionStorage.getItem('skip_pending_redirect')) {
      sessionStorage.removeItem('skip_pending_redirect');
      return;
    }

    // Account acceptatie (voorwaarden + dataverbetering) vastleggen
    if (sessionStorage.getItem('terms_accepted') === '1') {
      sessionStorage.removeItem('terms_accepted');
      fetch('/api/profile/accept-terms', { method: 'POST' }).catch(() => {});
    }

    fetch('/api/meting/pending')
      .then(r => r.json())
      .then(({ calculationId }) => {
        if (calculationId) {
          router.replace(`/nl/meting/${calculationId}`);
        }
      })
      .catch(() => {/* non-blocking */});
  }, [router]);

  return null;
}
