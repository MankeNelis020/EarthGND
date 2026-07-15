import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('plan, email, company_name, logo_url, installateur_naam, installateur_erkenning, terms_accepted_at')
    .eq('id', user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as {
    company_name?: string;
    installateur_naam?: string;
    installateur_erkenning?: string;
    logo_url?: string | null;
  };

  const patch: Record<string, string | null> = {};

  if ('company_name' in body) {
    patch.company_name = (body.company_name ?? '').trim() || null;
  }
  if ('installateur_naam' in body) {
    patch.installateur_naam = (body.installateur_naam ?? '').trim() || null;
  }
  if ('installateur_erkenning' in body) {
    patch.installateur_erkenning = (body.installateur_erkenning ?? '').trim() || null;
  }
  if ('logo_url' in body) {
    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
    if (body.logo_url && profile?.plan !== 'pro') {
      return NextResponse.json({ error: 'Bedrijfslogo is beschikbaar vanaf het Pro plan.' }, { status: 403 });
    }
    patch.logo_url = body.logo_url ?? null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('plan, email, company_name, logo_url, installateur_naam, installateur_erkenning, terms_accepted_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
