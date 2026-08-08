'use client';

import { useEffect } from 'react';

/**
 * Root error boundary (replaces root layout when it fails).
 * Fires the same operational beacon as locale error.tsx.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const code = 'E_RSC_RENDER';
    const status = 500;
    fetch('/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        status,
        digest: error.digest ?? null,
        path: typeof window !== 'undefined' ? window.location.pathname : null,
        message: error.message?.slice(0, 200) ?? null,
      }),
    }).catch(() => {});
  }, [error.digest, error.message]);

  return (
    <html lang="nl">
      <body style={{ background: '#1C1917', color: '#F5EFE6', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 480, margin: '80px auto', padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 12, letterSpacing: '0.08em', color: '#fca5a5' }}>FOUT 500</p>
          <h1 style={{ fontSize: 28, marginTop: 8 }}>Er ging iets mis</h1>
          <p style={{ color: 'rgba(245,239,230,0.55)', fontSize: 14, marginTop: 12 }}>
            Code <code>E_RSC_RENDER</code>
            {error.digest ? <> · Digest <code>{error.digest}</code></> : null}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              background: '#E8761A',
              color: '#fff',
              border: 0,
              borderRadius: 12,
              padding: '12px 20px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </body>
    </html>
  );
}
