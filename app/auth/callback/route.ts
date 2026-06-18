import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '';

  console.log('[auth/callback] hit — code present:', !!code, '| next:', next || '(none)', '| origin:', origin);

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
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) { pendingCookies.push(...cookiesToSet); },
      },
    },
  );

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${origin}/nl/login?error=auth`);
  }

  // Priority 1: explicit ?next= (survives when redirect_to comes through intact)
  // Priority 2: DB lookup via admin client — finds pending meting by email even
  //             when monteur_user_id is still NULL (first login via Google OAuth)
  // Fallback: dashboard
  let redirectPath = next || '/nl/dashboard';

  if (!next) {
    const email = sessionData.user?.email;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('[auth/callback] meting lookup — email:', email, '| service_key_set:', !!serviceKey);
    if (email && serviceKey) {
      try {
        const adminClient = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
        );
        const { data: meting, error: metingError } = await adminClient
          .from('pendiepte_metingen')
          .select('calculation_id, status, monteur_email')
          .ilike('monteur_email', email)
          .eq('status', 'invited')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        console.log('[auth/callback] admin query result — meting:', JSON.stringify(meting), '| error:', metingError?.message ?? null);

        if (meting?.calculation_id) {
          redirectPath = `/nl/meting/${meting.calculation_id}`;
          console.log('[auth/callback] monteur meting found:', redirectPath);
        }
      } catch (err) {
        console.error('[auth/callback] admin lookup threw:', err);
      }
    }
  }

  console.log('[auth/callback] redirecting to:', redirectPath);

  const response = NextResponse.redirect(`${origin}${redirectPath}`);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
