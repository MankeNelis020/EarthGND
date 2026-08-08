import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // Derive locale from Referer header if available, otherwise default to 'nl'
  const referer = request.headers.get('referer') ?? '';
  const refLocale = referer.match(/\/(nl|en|de)\//)?.[1] ?? 'nl';

  if (!code) {
    return NextResponse.redirect(`${origin}/${refLocale}/login?error=auth`);
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseKey) {
    console.error('[auth/callback/meting] E_SUPABASE_ENV');
    return NextResponse.redirect(`${origin}/${refLocale}/login?error=E_SUPABASE_ENV`);
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) { pendingCookies.push(...cookiesToSet); },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/${refLocale}/login?error=auth`);
  }

  const response = NextResponse.redirect(`${origin}/${refLocale}/meting/${uuid}`);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
