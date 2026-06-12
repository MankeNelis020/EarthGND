import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import type { UpdateRapportPayload } from '@/lib/types/rapport';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/rapport/[id] — fetch report + metingen
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const [{ data: report, error: re }, { data: metingen, error: me }] = await Promise.all([
    supabase.from('inspection_reports').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('metingen').select('*').eq('rapport_id', id).order('volgorde'),
  ]);

  if (re) return NextResponse.json({ error: re.message }, { status: re.code === 'PGRST116' ? 404 : 500 });
  if (me) return NextResponse.json({ error: me.message }, { status: 500 });

  return NextResponse.json({ report: { ...report, metingen: metingen ?? [] } });
}

// PATCH /api/rapport/[id] — save draft (concept only)
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  // Check report is still a concept and belongs to user
  const { data: existing } = await supabase
    .from('inspection_reports')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  if (existing.status === 'ondertekend') {
    return NextResponse.json({ error: 'Ondertekend rapport kan niet worden gewijzigd' }, { status: 403 });
  }

  const body = await request.json() as UpdateRapportPayload;
  const { metingen, ...reportFields } = body;

  // Update report fields
  const { error: updateError } = await supabase
    .from('inspection_reports')
    .update({ ...reportFields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'concept');

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Replace all metingen for this report (upsert strategy)
  if (metingen !== undefined) {
    await supabase.from('metingen').delete().eq('rapport_id', id);

    if (metingen.length > 0) {
      const rows = metingen.map((m, i) => ({
        rapport_id:  id,
        type:        m.type,
        waarde:      m.waarde ?? null,
        eenheid:     m.eenheid,
        meetmethode: m.meetmethode ?? null,
        toetswaarde: m.toetswaarde ?? null,
        pass_fail:   m.pass_fail ?? null,
        notities:    m.notities ?? null,
        volgorde:    i,
      }));
      const { error: metError } = await supabase.from('metingen').insert(rows);
      if (metError) return NextResponse.json({ error: metError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/rapport/[id] — delete concept report
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { error } = await supabase
    .from('inspection_reports')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'concept');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
