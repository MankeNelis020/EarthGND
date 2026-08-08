/** Stable client-visible error codes for RSC / app failures. */
export type AppErrorCode =
  | 'E_SUPABASE_ENV'
  | 'E_DASHBOARD'
  | 'E_AUTH_CALLBACK'
  | 'E_RSC_RENDER'
  | 'E_UNKNOWN';

export function codeFromError(error: Error & { digest?: string; code?: string }): AppErrorCode {
  const msg = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase();
  if (
    error.code === 'E_SUPABASE_ENV' ||
    (msg.includes('supabase') && (msg.includes('env') || msg.includes('url') || msg.includes('key')))
  ) {
    return 'E_SUPABASE_ENV';
  }
  if (msg.includes('dashboard')) return 'E_DASHBOARD';
  if (msg.includes('auth') || msg.includes('session')) return 'E_AUTH_CALLBACK';
  if (error.digest) return 'E_RSC_RENDER';
  return 'E_UNKNOWN';
}

export function statusFromCode(code: AppErrorCode): number {
  switch (code) {
    case 'E_SUPABASE_ENV':
      return 503;
    case 'E_AUTH_CALLBACK':
      return 401;
    default:
      return 500;
  }
}
