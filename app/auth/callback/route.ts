import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '';

  if (!code) {
    return NextResponse.redirect(`${origin}/nl/login?error=auth`);
  }

  // Collect cookies written during session exchange so we can attach them
  // to the redirect response we build afterwards.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${origin}/nl/login?error=auth`);
  }

  // Determine redirect destination.
  // Priority 1: explicit ?next= from the magic link's redirect_to
  // Priority 2: DB lookup — is this user an invited monteur?
  // Fallback: dashboard
  let redirectPath = next || '/nl/dashboard';

  if (!next) {
    const email = sessionData.user?.email;
    if (email) {
      const { data: meting } = await supabase
        .from('pendiepte_metingen')
        .select('calculation_id')
        .eq('monteur_email', email)
        .eq('status', 'invited')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (meting?.calculation_id) {
        redirectPath = `/nl/meting/${meting.calculation_id}`;
        console.log('[auth/callback] monteur meting found, redirecting to:', redirectPath);
      }
    }
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
