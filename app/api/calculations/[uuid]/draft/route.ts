import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

// POST — ensure a draft pendiepte_metingen record exists for this calculation.
// Called when the user triggers either the "Email rapport" or "Mail monteur" CTA.
// Idempotent: safe to call multiple times.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: calc } = await supabase
    .from('calculations')
    .select('id, tool, postcode, rapport_naam, created_at')
    .eq('id', uuid)
    .eq('user_id', user.id)
    .eq('tool', 'diepte')
    .single();

  if (!calc) return NextResponse.json({ error: 'Berekening niet gevonden' }, { status: 404 });

  // Set a default rapport_naam if none exists yet
  if (!calc.rapport_naam) {
    const postcode = typeof calc.postcode === 'string' ? calc.postcode : null;
    const datum = new Date(calc.created_at).toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const defaultNaam = postcode ? `${postcode} — ${datum}` : `Pendiepte berekening — ${datum}`;

    await supabase
      .from('calculations')
      .update({ rapport_naam: defaultNaam })
      .eq('id', uuid);
  }

  // Upsert pendiepte_metingen record in draft status (no-op if already exists)
  await supabase
    .from('pendiepte_metingen')
    .upsert({
      calculation_id:     uuid,
      calculator_user_id: user.id,
      status:             'draft',
    }, { onConflict: 'calculation_id', ignoreDuplicates: true });

  return NextResponse.json({ ok: true });
}

// PATCH — rename the rapport
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { rapport_naam } = await req.json() as { rapport_naam: string };
  if (!rapport_naam?.trim()) return NextResponse.json({ error: 'Naam mag niet leeg zijn' }, { status: 400 });

  const { error } = await supabase
    .from('calculations')
    .update({ rapport_naam: rapport_naam.trim() })
    .eq('id', uuid)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
