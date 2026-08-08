import { NextResponse } from 'next/server';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

/**
 * Safe env presence check — never returns secret values.
 * Use on Preview to verify Vercel Environment toggles (Production / Preview / Development).
 */
export async function GET() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  const report = {
    ok: !!(url && key),
    code: url && key ? 'OK' : 'E_SUPABASE_ENV',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    },
  };

  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
