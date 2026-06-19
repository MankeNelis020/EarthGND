import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  // Verify ownership
  const { data: calc } = await supabase
    .from('calculations')
    .select('id')
    .eq('id', uuid)
    .eq('user_id', user.id)
    .single();

  if (!calc) return NextResponse.json({ error: 'Berekening niet gevonden' }, { status: 404 });

  // Block deletion when an active meting exists (monteur is involved)
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: meting } = await admin
    .from('pendiepte_metingen')
    .select('status')
    .eq('calculation_id', uuid)
    .single();

  if (meting && ['invited', 'submitted', 'confirmed'].includes(meting.status)) {
    return NextResponse.json(
      { error: 'Kan niet verwijderen — er is een actieve veldmeting aan gekoppeld' },
      { status: 409 },
    );
  }

  // Delete meting record first (if draft), then the calculation
  if (meting) {
    await admin.from('pendiepte_metingen').delete().eq('calculation_id', uuid);
  }

  const { error } = await supabase
    .from('calculations')
    .delete()
    .eq('id', uuid)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
