import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import type { CreateRapportPayload } from '@/lib/types/rapport';

export const runtime = 'nodejs';

// GET /api/rapport — list all reports for the authenticated user
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data, error } = await supabase
    .from('inspection_reports')
    .select('id, status, versie, opdrachtgever, locatie, systeemtype, datum_uitvoering, pdf_url, created_at, updated_at, calculation_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data });
}

// POST /api/rapport — create a new concept report
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as CreateRapportPayload;

  // If a calculation_id was given, fetch scan context to pre-fill
  let scanContext = body.scan_context ?? {};
  if (body.calculation_id) {
    const { data: calc } = await supabase
      .from('calculations')
      .select('postcode, input, resultaat, risicoklasse, created_at')
      .eq('id', body.calculation_id)
      .eq('user_id', user.id)
      .single();

    if (calc) {
      const input = calc.input as Record<string, unknown>;
      const resultaat = calc.resultaat as Record<string, unknown>;
      scanContext = {
        postcode:            calc.postcode ?? undefined,
        rho:                 typeof input.rho === 'number' ? input.rho : undefined,
        grondwaterstand_m:   typeof input.groundwaterDepth === 'number' ? input.groundwaterDepth : undefined,
        ph:                  typeof input.ph === 'number' ? input.ph : undefined,
        voorspeld_diepte_m:  typeof resultaat.depth === 'number' ? resultaat.depth : undefined,
        voorspeld_ra_ohm:    typeof resultaat.achievedResistance === 'number' ? resultaat.achievedResistance : undefined,
        risicoklasse:        calc.risicoklasse ?? undefined,
        databron:            'BRO bodemdata, postcodeniveau, indicatief',
        berekend_op:         calc.created_at,
      };
    }
  }

  const { data, error } = await supabase
    .from('inspection_reports')
    .insert({
      user_id:         user.id,
      calculation_id:  body.calculation_id ?? null,
      project_id:      body.project_id ?? null,
      status:          'concept',
      scan_context:    scanContext,
      systeemtype:     body.systeemtype ?? null,
      locatie:         body.locatie ?? null,
      audit_trail:     [{ actie: 'aangemaakt', door: user.email, op: new Date().toISOString() }],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data }, { status: 201 });
}
