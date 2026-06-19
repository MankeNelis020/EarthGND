import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '';

  // Derive locale from the ?next= param if present, otherwise default to 'nl'
  const nextLocale = next.match(/^\/(nl|en|de)\//)?.[1] ?? 'nl';

  if (!code) {
    return NextResponse.redirect(`${origin}/${nextLocale}/login?error=auth`);
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
    return NextResponse.redirect(`${origin}/${nextLocale}/login?error=auth`);
  }

  // Priority 1: explicit ?next= (survives when redirect_to comes through intact)
  // Priority 2: DB lookup via admin client — finds pending meting by email even
  //             when monteur_user_id is still NULL (first login via Google OAuth)
  // Fallback: dashboard
  let redirectPath = next || `/${nextLocale}/dashboard`;

  if (!next) {
    const email = sessionData.user?.email;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (email && serviceKey) {
      try {
        const adminClient = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
        );
        const { data: meting } = await adminClient
          .from('pendiepte_metingen')
          .select('calculation_id, status, monteur_email')
          .ilike('monteur_email', email)
          .eq('status', 'invited')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (meting?.calculation_id) {
          redirectPath = `/${nextLocale}/meting/${meting.calculation_id}`;
        }
      } catch {
        // Admin lookup failure is non-fatal; fall through to dashboard
      }
    }
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
