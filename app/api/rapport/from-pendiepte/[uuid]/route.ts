import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  buildEnrichedScanContext,
  buildRaMeting,
  canCreateNenReport,
  mapElectrodeType,
  resolveDatumUitvoering,
  resolveElektrodeAantal,
  formatLocatieLabel,
  type PendiepteCalcRow,
  type PendiepteMetingRow,
} from '@/lib/pendiepte-rapport-bridge';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

/** GET — check if NEN 1010 rapport already exists for this pendiepte job. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const access = await assertCalculatorAccess(supabase, uuid, user.id, user.email);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data: existing } = await supabase
    .from('inspection_reports')
    .select('id, status, locatie, updated_at')
    .eq('user_id', user.id)
    .eq('calculation_id', uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const gate = canCreateNenReport(access.meting?.status ?? null);

  return NextResponse.json({
    canCreate: gate.ok,
    reason:    gate.reason ?? null,
    existingReport: existing ? {
      id:     existing.id,
      status: existing.status,
      locatie: existing.locatie,
    } : null,
  });
}

/** POST — create (or return existing) NEN 1010 rapport from pendiepte + veldmeting. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const access = await assertCalculatorAccess(supabase, uuid, user.id, user.email);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  if (access.calc.user_id !== user.id) {
    return NextResponse.json({ error: 'Alleen de berekening-eigenaar kan een NEN 1010-rapport aanmaken.' }, { status: 403 });
  }

  const meting = access.meting;
  const gate = canCreateNenReport(meting?.status ?? null);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 400 });

  const { data: existing } = await supabase
    .from('inspection_reports')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('calculation_id', uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      reportId: existing.id,
      existing: true,
      status:   existing.status,
    });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('installateur_naam, installateur_erkenning')
    .eq('id', user.id)
    .single();

  const calc = access.calc as PendiepteCalcRow;
  const metingRow = meting as PendiepteMetingRow;
  const scanContext = buildEnrichedScanContext(calc, metingRow);
  const locatie = formatLocatieLabel(calc, metingRow);
  const raMeting = buildRaMeting(metingRow, calc);

  const { data: report, error: reportErr } = await supabase
    .from('inspection_reports')
    .insert({
      user_id:              user.id,
      calculation_id:       uuid,
      status:               'concept',
      versie:               1,
      scan_context:         scanContext,
      locatie,
      elektrode_type:       mapElectrodeType(metingRow.electrode_type),
      elektrode_diepte_m:   metingRow.installed_depth,
      elektrode_aantal:     resolveElektrodeAantal(metingRow),
      uitvoerder_naam:      profile?.installateur_naam ?? null,
      uitvoerder_erkenning: profile?.installateur_erkenning ?? null,
      datum_uitvoering:     resolveDatumUitvoering(metingRow),
      consent_kalibratie:   true,
      eindconclusie:        metingRow.notes ?? null,
      audit_trail:          [{
        actie:  'aangemaakt_vanuit_pendiepte',
        door:   user.email ?? user.id,
        op:     new Date().toISOString(),
        detail: `Veldmeting ${metingRow.status} gekoppeld`,
      }],
    })
    .select('id')
    .single();

  if (reportErr || !report) {
    return NextResponse.json({ error: reportErr?.message ?? 'Rapport aanmaken mislukt' }, { status: 500 });
  }

  if (raMeting) {
    await supabase.from('metingen').insert({
      rapport_id:  report.id,
      type:        'ra',
      waarde:      raMeting.waarde,
      eenheid:     'Ω',
      toetswaarde: raMeting.toetswaarde,
      pass_fail:   raMeting.pass_fail,
      meetmethode: 'Veldmeting (EarthGND pendiepte)',
    });
  }

  return NextResponse.json({
    reportId: report.id,
    existing: false,
    created:  true,
  }, { status: 201 });
}

async function assertCalculatorAccess(
  supabase: ReturnType<typeof createClient>,
  uuid: string,
  userId: string,
  email: string | undefined,
) {
  const [{ data: calc }, { data: meting }] = await Promise.all([
    supabase
      .from('calculations')
      .select('id, user_id, postcode, rapport_naam, input_values, result, risicoklasse, created_at')
      .eq('id', uuid)
      .maybeSingle(),
    supabase
      .from('pendiepte_metingen')
      .select('*')
      .eq('calculation_id', uuid)
      .maybeSingle(),
  ]);

  if (!calc) return { error: 'Berekening niet gevonden.', status: 404 as const };

  const isOwner = calc.user_id === userId;
  const isMonteur = meting?.monteur_user_id === userId ||
    meting?.monteur_email?.toLowerCase() === email?.toLowerCase();

  if (!isOwner && !isMonteur) {
    return { error: 'Geen toegang tot deze berekening.', status: 403 as const };
  }

  return { calc, meting };
}
