import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

/** Records account acceptance of terms + implicit data-improvement consent. Idempotent. */
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update({ terms_accepted_at: now, updated_at: now })
    .eq('id', user.id)
    .is('terms_accepted_at', null)
    .select('terms_accepted_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('terms_accepted_at')
      .eq('id', user.id)
      .single();
    return NextResponse.json({ ok: true, terms_accepted_at: existing?.terms_accepted_at ?? now });
  }

  return NextResponse.json({ ok: true, terms_accepted_at: data.terms_accepted_at });
}
