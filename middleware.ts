import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest } from 'next/server';
import { createClient as createSupabaseMiddleware } from '@/utils/supabase/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  try {
    // Refresh Supabase session on every request
    const supabaseResponse = createSupabaseMiddleware(request);

    // Then apply next-intl locale routing
    const intlResponse = intlMiddleware(request);

    // Merge cookies from both responses so session stays alive
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      intlResponse.cookies.set(cookie.name, cookie.value);
    });

    return intlResponse;
  } catch {
    // Fallback: just apply locale routing if Supabase middleware fails
    return intlMiddleware(request);
  }
}

export const config = {
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
