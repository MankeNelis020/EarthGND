import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { SignPayload } from '@/lib/types/rapport';
import { VERPLICHTE_METINGEN } from '@/lib/rapport-config';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as SignPayload;

  if (!body.akkoord || !body.naam) {
    return NextResponse.json(
      { error: 'Naam en akkoord zijn verplicht voor ondertekening.' },
      { status: 400 },
    );
  }

  // Fetch report + metingen
  const [{ data: report }, { data: metingen }] = await Promise.all([
    supabase.from('inspection_reports').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('metingen').select('*').eq('rapport_id', id),
  ]);

  if (!report) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  if (report.status === 'ondertekend') {
    return NextResponse.json({ error: 'Rapport is al ondertekend' }, { status: 409 });
  }

  // Validate required measurements are present
  if (report.systeemtype) {
    const required = VERPLICHTE_METINGEN[report.systeemtype as keyof typeof VERPLICHTE_METINGEN] ?? [];
    const present = (metingen ?? []).map((m: { type: string }) => m.type);
    const missing = required.filter(t => !present.includes(t));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Verplichte metingen ontbreken: ${missing.join(', ')}` },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();
  const auditEntry = {
    actie: 'ondertekend',
    door: body.naam,
    op: now,
    detail: `Erkenning: ${body.erkenning}`,
  };

  // Lock the report
  const { error: signError } = await supabase
    .from('inspection_reports')
    .update({
      status:                  'ondertekend',
      versie:                  (report.versie ?? 1) + 1,
      conformiteit_akkoord:    true,
      conformiteit_naam:       body.naam,
      conformiteit_erkenning:  body.erkenning ?? null,
      conformiteit_datum:      now,
      consent_delen:           body.consent_delen,
      consent_kalibratie:      body.consent_kalibratie,
      deel_ontvanger_email:    body.deel_ontvanger_email ?? null,
      deel_ontvanger_naam:     body.deel_ontvanger_naam ?? null,
      deel_pdf:                body.deel_pdf ?? true,
      deel_json:               body.deel_json ?? false,
      audit_trail:             [...(report.audit_trail ?? []), auditEntry],
      updated_at:              now,
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  // Generate calibration record (implicit consent via account terms)
  const consentKalibratie = body.consent_kalibratie !== false;
  if (consentKalibratie && report.scan_context) {
    const ctx = report.scan_context as Record<string, unknown>;
    const raGemeten = (metingen ?? []).find((m: { type: string }) => m.type === 'ra');

    if (ctx.rho !== undefined) {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await admin.from('kalibratie_records').insert({
        voorspeld_diepte_m:  typeof ctx.voorspeld_diepte_m === 'number' ? ctx.voorspeld_diepte_m : null,
        voorspeld_ra_ohm:    typeof ctx.voorspeld_ra_ohm === 'number' ? ctx.voorspeld_ra_ohm : null,
        rho_voorspeld:       typeof ctx.rho === 'number' ? ctx.rho : null,
        gemeten_diepte_m:    typeof report.elektrode_diepte_m === 'number' ? report.elektrode_diepte_m : null,
        gemeten_ra_ohm:      raGemeten ? (raGemeten as { waarde: number | null }).waarde : null,
        elektrode_type:      report.elektrode_type ?? null,
        elektrode_aantal:    report.elektrode_aantal ?? 1,
        postcode_4cijfers:   typeof ctx.postcode === 'string' ? ctx.postcode.substring(0, 4) : null,
        grondwaterstand_m:   typeof ctx.grondwaterstand_m === 'number' ? ctx.grondwaterstand_m : null,
        systeemtype:         report.systeemtype ?? null,
        consent_gegeven:     true,
      });
    }
  }

  // Trigger share if consent given and recipient configured
  if (body.consent_delen && body.deel_ontvanger_email) {
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/rapport/${id}/share`;
    fetch(shareUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal': process.env.SUPABASE_SERVICE_ROLE_KEY! },
      body: JSON.stringify({ rapport_id: id }),
    }).catch(() => {/* non-blocking, log elsewhere */});
  }

  return NextResponse.json({ ok: true });
}
