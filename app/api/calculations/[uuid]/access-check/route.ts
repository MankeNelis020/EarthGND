import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

/** Verify user can open opleverrapport for this calculation UUID. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Niet ingelogd' }, { status: 401 });

  const [{ data: calc }, { data: meting }] = await Promise.all([
    supabase.from('calculations').select('id, user_id, postcode, rapport_naam').eq('id', uuid).maybeSingle(),
    supabase.from('pendiepte_metingen').select('calculation_id, monteur_email, monteur_user_id, status').eq('calculation_id', uuid).maybeSingle(),
  ]);

  if (!calc) {
    return NextResponse.json({ ok: false, error: 'Berekening niet gevonden. Controleer de UUID.' }, { status: 404 });
  }

  const isOwner   = calc.user_id === user.id;
  const isMonteur = meting?.monteur_user_id === user.id ||
    meting?.monteur_email?.toLowerCase() === user.email?.toLowerCase();

  if (!isOwner && !isMonteur) {
    return NextResponse.json({ ok: false, error: 'Geen toegang tot deze berekening.' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    label: calc.rapport_naam ?? calc.postcode ?? uuid.slice(0, 8),
    hasMeting: !!meting,
    metingStatus: meting?.status ?? null,
  });
}
