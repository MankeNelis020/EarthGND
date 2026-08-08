import type { AppErrorCode } from '@/lib/errors/codes';

/** Structured server log so Vercel runtime logs keep the real cause + digest correlation. */
export function logServerError(opts: {
  code: AppErrorCode | string;
  status?: number;
  path?: string;
  err: unknown;
  digest?: string | null;
}): void {
  const message =
    opts.err instanceof Error
      ? opts.err.message
      : typeof opts.err === 'string'
        ? opts.err
        : 'unknown';

  console.error(
    JSON.stringify({
      event: 'app_error',
      code: opts.code,
      status: opts.status ?? 500,
      digest: opts.digest ?? null,
      path: opts.path ?? null,
      message: message.slice(0, 500),
      stack:
        opts.err instanceof Error && opts.err.stack
          ? opts.err.stack.split('\n').slice(0, 8).join(' | ')
          : null,
      at: new Date().toISOString(),
    }),
  );
}
