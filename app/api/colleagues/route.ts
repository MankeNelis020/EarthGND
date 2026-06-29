import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { isValidColleagueEmail, normalizeColleagueEmail } from '@/lib/colleagues';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data, error } = await supabase
    .from('saved_colleagues')
    .select('id, name, email, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ colleagues: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as { name?: string; email?: string };
  const email = normalizeColleagueEmail(body.email ?? '');
  const name = (body.name ?? '').trim();

  if (!isValidColleagueEmail(email)) {
    return NextResponse.json({ error: 'Geldig e-mailadres vereist' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('saved_colleagues')
    .upsert(
      { user_id: user.id, email, name },
      { onConflict: 'user_id,email' },
    )
    .select('id, name, email, created_at, last_used_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ colleague: data });
}
