/**
 * Shared public Supabase env resolution.
 * Browser client historically accepted ANON_KEY as fallback; server/middleware
 * must use the same resolution or post-login RSC pages crash while client auth works.
 */

export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

export function requireSupabasePublicEnv(): { url: string; key: string } {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    const err = new Error(
      'Supabase public env missing (NEXT_PUBLIC_SUPABASE_URL and PUBLISHABLE_KEY or ANON_KEY)',
    ) as Error & { code: string; status: number };
    err.code = 'E_SUPABASE_ENV';
    err.status = 503;
    throw err;
  }
  return { url, key };
}
