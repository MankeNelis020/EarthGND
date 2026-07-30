import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

export function moatServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function requireMoatAdmin(): Promise<
  | { user: { id: string; email?: string }; error?: undefined }
  | { error: NextResponse; user?: undefined }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) };
  }
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(user.email ?? '')) {
    return {
      error: NextResponse.json(
        { error: 'Geen toegang — voeg je e-mail toe aan ADMIN_EMAILS' },
        { status: 403 },
      ),
    };
  }
  return { user: { id: user.id, email: user.email ?? undefined } };
}
