'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { pushEvent, type EarthGNDLocale } from '@/lib/analytics/gtm';
import { codeFromError, statusFromCode } from '@/lib/errors/codes';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const gtmLocale = (locale === 'en' ? 'en' : 'nl') as EarthGNDLocale;

  const code = codeFromError(error);
  const status = statusFromCode(code);

  useEffect(() => {
    const payload = {
      error_code: code,
      status_code: status,
      digest: error.digest ?? null,
      path: pathname,
      message: error.message?.slice(0, 200) ?? null,
    };

    // GTM (consent-gated)
    pushEvent('app_error', payload, gtmLocale);

    // Always send operational beacon (for Vercel log correlation)
    fetch('/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        status,
        digest: error.digest ?? null,
        path: pathname,
        message: error.message?.slice(0, 200) ?? null,
      }),
    }).catch(() => {});
  }, [code, status, error.digest, error.message, pathname, gtmLocale]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-red-300/80">
        Fout {status}
      </p>
      <h1 className="font-condensed mt-2 text-3xl font-black text-white">
        Er ging iets mis
      </h1>
      <p className="mt-3 text-sm text-white/55">
        De pagina kon niet worden geladen. Probeer opnieuw of ga terug naar het dashboard.
      </p>

      <div className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-xs text-white/60">
        <p>
          <span className="text-white/35">Code</span>{' '}
          <span className="font-mono text-amber-200">{code}</span>
        </p>
        {error.digest && (
          <p className="mt-1">
            <span className="text-white/35">Digest</span>{' '}
            <span className="font-mono text-white/80">{error.digest}</span>
          </p>
        )}
        <p className="mt-1">
          <span className="text-white/35">HTTP</span>{' '}
          <span className="font-mono text-white/80">{status}</span>
        </p>
      </div>

      {code === 'E_SUPABASE_ENV' && (
        <div className="mt-4 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-xs leading-relaxed text-amber-100/90">
          <p className="font-semibold text-amber-200">Vercel Preview mist Supabase-env</p>
          <p className="mt-2 text-amber-100/80">
            Zet in Vercel → Environment Variables deze keys ook aan voor <strong>Preview</strong>:
            {' '}<span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span>,{' '}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span> (of{' '}
            <span className="font-mono">ANON_KEY</span>), en{' '}
            <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>. Daarna Preview redeployen.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-xl bg-[#E8761A] px-5 py-2.5 text-sm font-bold text-white"
        >
          Opnieuw proberen
        </button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80"
        >
          Naar dashboard
        </Link>
      </div>
    </div>
  );
}
