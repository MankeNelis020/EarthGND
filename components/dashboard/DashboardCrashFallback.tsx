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
