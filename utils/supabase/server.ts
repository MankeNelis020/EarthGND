import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabasePublicEnv } from '@/lib/supabase/public-env';

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  // PUBLISHABLE_KEY || ANON_KEY — must match browser client resolution.
  const { url: supabaseUrl, key: supabaseKey } = requireSupabasePublicEnv();

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware handles session refresh.
          }
        },
      },
    },
  );
};
