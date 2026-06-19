import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

// PATCH /api/meting/[uuid]/revoke — revert an 'invited' meting back to 'draft'
export async function PATCH(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: meting } = await admin
    .from('pendiepte_metingen')
    .select('calculator_user_id, status')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });
  if (meting.calculator_user_id !== user.id)
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  if (meting.status !== 'invited')
    return NextResponse.json({ error: 'Uitnodiging kan alleen worden ingetrokken bij status "invited"' }, { status: 409 });

  const { error } = await admin
    .from('pendiepte_metingen')
    .update({
      status:           'draft',
      monteur_email:    null,
      monteur_user_id:  null,
    })
    .eq('calculation_id', uuid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
