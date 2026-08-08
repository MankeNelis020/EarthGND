'use client';

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { pushEvent } from '@/lib/analytics/gtm';

export function DashboardCrashFallback({
  code,
  status = 500,
  detail,
}: {
  code: string;
  status?: number;
  detail?: string | null;
}) {
  useEffect(() => {
    pushEvent('app_error', {
      error_code: code,
      status_code: status,
      path: '/dashboard',
      message: detail?.slice(0, 200) ?? null,
    });
    fetch('/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        status,
        path: '/dashboard',
        message: detail?.slice(0, 200) ?? null,
      }),
    }).catch(() => {});
  }, [code, status, detail]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-red-300/80">
        Fout {status}
      </p>
      <h1 className="font-condensed mt-2 text-3xl font-black text-white">
        Dashboard kon niet laden
      </h1>
      <p className="mt-3 text-sm text-white/55">
        Je bent wel ingelogd. Probeer opnieuw of open de sandbox / calculators.
      </p>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-xs text-white/60">
        <p>
          <span className="text-white/35">Code</span>{' '}
          <span className="font-mono text-amber-200">{code}</span>
        </p>
        {detail && (
          <p className="mt-2 break-words font-mono text-white/45">{detail}</p>
        )}
      </div>

      {code === 'E_SUPABASE_ENV' && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-xs leading-relaxed text-amber-100/90">
          <p className="font-semibold text-amber-200">Vercel Preview mist Supabase-env</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-amber-100/80">
            <li>Open Vercel → Project → Settings → Environment Variables</li>
            <li>
              Zet <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> aan voor{' '}
              <strong>Preview</strong> (niet alleen Production)
            </li>
            <li>
              Zet ook <span className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span> of{' '}
              <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> aan voor Preview
            </li>
            <li>
              Zet <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> aan voor Preview
              (monteur-queries)
            </li>
            <li>Redeploy de Preview na opslaan</li>
          </ol>
          <p className="mt-2 text-amber-100/60">
            Check: open <span className="font-mono">/api/health/env</span> op deze preview — alle
            booleans moeten <span className="font-mono">true</span> zijn.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-xl bg-[#E8761A] px-5 py-2.5 text-sm font-bold text-white"
        >
          Opnieuw proberen
        </button>
        <Link
          href="/tool/diepte"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80"
        >
          Pendiepte calculator
        </Link>
      </div>
    </div>
  );
}
