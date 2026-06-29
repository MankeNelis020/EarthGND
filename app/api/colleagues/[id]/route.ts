import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { isValidColleagueEmail, normalizeColleagueEmail } from '@/lib/colleagues';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as { name?: string; email?: string; touch?: boolean };
  const updates: Record<string, string> = {};

  if (body.name != null) updates.name = body.name.trim();
  if (body.email != null) {
    const email = normalizeColleagueEmail(body.email);
    if (!isValidColleagueEmail(email)) {
      return NextResponse.json({ error: 'Geldig e-mailadres vereist' }, { status: 400 });
    }
    updates.email = email;
  }
  if (body.touch) {
    updates.last_used_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('saved_colleagues')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, email, created_at, last_used_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Collega niet gevonden' }, { status: 404 });

  return NextResponse.json({ colleague: data });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { error } = await supabase
    .from('saved_colleagues')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
