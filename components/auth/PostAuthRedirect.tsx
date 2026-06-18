'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function PostAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
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
