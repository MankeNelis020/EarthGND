import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

// GET — return calculation + meting data for the monteur form
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  // Load meting record (monteur must match by email or user_id)
  const { data: meting } = await supabase
    .from('pendiepte_metingen')
    .select('*')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });

  // Authorise: either the calculator or the invited monteur (matched by email)
  const isCalculator = meting.calculator_user_id === user.id;
  const isMonteur    = meting.monteur_user_id === user.id ||
                       meting.monteur_email === user.email;

  if (!isCalculator && !isMonteur) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  }

  // If monteur_user_id is not yet set, claim it now
  if (isMonteur && !meting.monteur_user_id) {
    await supabase
      .from('pendiepte_metingen')
      .update({ monteur_user_id: user.id })
      .eq('calculation_id', uuid);
  }

  // Load the calculation for expected metrics
  const { data: calc } = await supabase
    .from('calculations')
    .select('id, tool, result, input_values, postcode')
    .eq('id', uuid)
    .single();

  return NextResponse.json({ meting, calc });
}

interface DepthPoint { depth: number; ra: number }

// PATCH — monteur auto-saves draft (no status change, no validation)
export async function PATCH(request: NextRequest, { params }: Ctx) {
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
    .select('monteur_user_id, monteur_email, status')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });
  if (meting.status === 'submitted' || meting.status === 'confirmed') {
    return NextResponse.json({ error: 'Meting is al ingediend' }, { status: 409 });
  }

  const isMonteur = meting.monteur_user_id === user.id ||
                    meting.monteur_email?.toLowerCase() === user.email?.toLowerCase();
  if (!isMonteur) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const body = await request.json() as Partial<MetingBody>;

  await admin
    .from('pendiepte_metingen')
    .update({
      monteur_user_id: user.id,
      lat:             body.lat ?? null,
      lon:             body.lon ?? null,
      gps_accuracy_m:  body.gps_accuracy_m ?? null,
      postcode:        body.postcode ?? null,
      straatnaam:      body.straatnaam ?? null,
      huisnummer:      body.huisnummer ?? null,
      woonplaats:      body.woonplaats ?? null,
      depth_curve:     body.depth_curve ?? [],
      achieved_ra:     body.achieved_ra ?? null,
      installed_depth: body.installed_depth ?? null,
      electrode_type:  body.electrode_type ?? null,
      notes:           body.notes ?? null,
      // status stays unchanged
    })
    .eq('calculation_id', uuid);

  return NextResponse.json({ ok: true });
}

interface MetingBody {
  lat?:            number;
  lon?:            number;
  gps_accuracy_m?: number;
  postcode?:       string;
  straatnaam?:     string;
  huisnummer?:     string;
  woonplaats?:     string;
  depth_curve:     DepthPoint[];
  achieved_ra:     number;
  installed_depth: number;
  electrode_type?: string;
  notes?:          string;
}

// POST — monteur submits measurements
export async function POST(request: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  // Use admin client — RLS UPDATE policy requires monteur_user_id which may
  // still be null on first visit; admin client bypasses this restriction.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: meting } = await admin
    .from('pendiepte_metingen')
    .select('monteur_user_id, monteur_email, status')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });

  const isMonteur = meting.monteur_user_id === user.id ||
                    meting.monteur_email?.toLowerCase() === user.email?.toLowerCase();

  if (!isMonteur) return NextResponse.json({ error: 'Geen toegang — u bent niet de aangewezen monteur' }, { status: 403 });
  if (meting.status === 'submitted' || meting.status === 'confirmed') {
    return NextResponse.json({ error: 'Meting is al ingediend en kan niet meer worden gewijzigd' }, { status: 409 });
  }

  const body = await request.json() as MetingBody;

  if (!body.depth_curve || !Array.isArray(body.depth_curve)) {
    return NextResponse.json({ error: 'Dieptecurve ontbreekt' }, { status: 400 });
  }
  if (body.achieved_ra == null || body.installed_depth == null) {
    return NextResponse.json({ error: 'Eindmeting (Ra en diepte) verplicht' }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from('pendiepte_metingen')
    .update({
      monteur_user_id: user.id,
      lat:             body.lat,
      lon:             body.lon,
      gps_accuracy_m:  body.gps_accuracy_m,
      postcode:        body.postcode,
      straatnaam:      body.straatnaam,
      huisnummer:      body.huisnummer,
      woonplaats:      body.woonplaats,
      depth_curve:     body.depth_curve,
      achieved_ra:     body.achieved_ra,
      installed_depth: body.installed_depth,
      electrode_type:  body.electrode_type,
      notes:           body.notes,
      status:          'submitted',
      submitted_at:    new Date().toISOString(),
    })
    .eq('calculation_id', uuid);

  if (updateError) {
    return NextResponse.json({ error: 'Opslaan mislukt: ' + updateError.message }, { status: 500 });
  }

  // Look up calculator's email to send confirmation (reuse admin client from above)
  const { data: calcRow } = await supabase
    .from('calculations')
    .select('user_id, postcode')
    .eq('id', uuid)
    .single();

  if (calcRow?.user_id) {
    const { data: callerData } = await admin.auth.admin.getUserById(calcRow.user_id);
    const callerEmail = callerData?.user?.email;

    if (callerEmail) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earthgnd.com';
      const rapportLink = `${baseUrl}/nl/pendiepte-rapport/${uuid}`;
      const postcode = typeof calcRow.postcode === 'string' ? calcRow.postcode : '—';

      if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true });
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@earthgnd.com',
        to: callerEmail,
        subject: `EarthGND — Veldmeting bevestigd (${postcode})`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
            <div style="background:#1C1917;padding:24px;text-align:center">
              <h1 style="color:#E8761A;margin:0;font-size:24px">EarthGND</h1>
              <p style="color:#F5EFE6;margin:8px 0 0">Veldmeting gereed</p>
            </div>
            <div style="padding:32px">
              <p style="color:#1C1917;font-size:15px">Goedendag,</p>
              <p style="color:#444;font-size:14px;line-height:1.6">
                De monteur heeft de veldmeting voor postcode <strong>${postcode}</strong> ingediend.
                U kunt het opleverrapport nu bekijken en bevestigen.
              </p>
              <div style="margin:32px 0;text-align:center">
                <a href="${rapportLink}"
                   style="background:#E8761A;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                  Bekijk opleverrapport →
                </a>
              </div>
            </div>
            <div style="background:#f5f5f5;padding:16px;text-align:center;color:#999;font-size:12px">
              © ${new Date().getFullYear()} EarthGND · Professionele aardingsberekeningen
            </div>
          </div>
        `,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
