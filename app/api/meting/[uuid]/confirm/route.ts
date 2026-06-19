import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  // Verify this is the calculator user
  const { data: calc } = await supabase
    .from('calculations')
    .select('user_id')
    .eq('id', uuid)
    .eq('user_id', user.id)
    .single();

  if (!calc) return NextResponse.json({ error: 'Berekening niet gevonden of geen toegang' }, { status: 404 });

  // Use admin client to bypass RLS when reading/updating pendiepte_metingen
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: meting } = await admin
    .from('pendiepte_metingen')
    .select('status')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });
  if (meting.status !== 'submitted') {
    return NextResponse.json({ error: 'Meting kan alleen worden bevestigd als de status "ingediend" is' }, { status: 409 });
  }

  const { error } = await admin
    .from('pendiepte_metingen')
    .update({
      status:       'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('calculation_id', uuid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

