import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

interface KlicPayload {
  rapport_id?: string;
  meldingsnummer: string;
  melddatum?: string;
  geldig_tot?: string;
  graaf_adres?: string;
  graaf_postcode?: string;
  utiliteiten?: Record<string, boolean>;
  netbeheerders?: string[];
  diepste_kabel_m?: number | null;
  veilig_graven?: boolean;
  opmerkingen?: string;
  foto_path?: string;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const rapportId = request.nextUrl.searchParams.get('rapport_id');

  let query = supabase
    .from('klic_meldingen')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (rapportId) query = query.eq('rapport_id', rapportId);

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as KlicPayload;

  if (!body.meldingsnummer?.trim()) {
    return NextResponse.json({ error: 'Meldingsnummer is verplicht' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('klic_meldingen')
    .insert({
      user_id: user.id,
      rapport_id: body.rapport_id ?? null,
      meldingsnummer: body.meldingsnummer.trim(),
      melddatum: body.melddatum ?? null,
      geldig_tot: body.geldig_tot ?? null,
      graaf_adres: body.graaf_adres ?? null,
      graaf_postcode: body.graaf_postcode ?? null,
      utiliteiten: body.utiliteiten ?? {},
      netbeheerders: body.netbeheerders ?? [],
      diepste_kabel_m: body.diepste_kabel_m ?? null,
      veilig_graven: body.veilig_graven ?? true,
      opmerkingen: body.opmerkingen ?? null,
      foto_path: body.foto_path ?? null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If linked to a rapport, update the rapport's klic_melding_id
  if (body.rapport_id && data?.id) {
    await supabase
      .from('inspection_reports')
      .update({ klic_melding_id: data.id })
      .eq('id', body.rapport_id)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ id: data?.id });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await request.json() as Partial<KlicPayload>;

  const { error } = await supabase
    .from('klic_meldingen')
    .update(body)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
