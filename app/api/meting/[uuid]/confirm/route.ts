import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { processMeting } from '@/lib/soil-knowledge/evidence-accumulator';
import { enrichMetingFromCalculation } from '@/lib/soil-knowledge/meting-enrichment';
import { pushMetingToGoogleSheet } from '@/lib/soil-knowledge/sheet-sync';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: calc } = await supabase
    .from('calculations')
    .select('user_id')
    .eq('id', uuid)
    .eq('user_id', user.id)
    .single();

  if (!calc) return NextResponse.json({ error: 'Berekening niet gevonden of geen toegang' }, { status: 404 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: meting } = await admin
    .from('pendiepte_metingen')
    .select('*')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });
  if (meting.status !== 'submitted') {
    return NextResponse.json({ error: 'Meting kan alleen worden bevestigd als de status "ingediend" is' }, { status: 409 });
  }

  // BRO-snapshot uit berekening vóór kennisbank-verwerking
  await enrichMetingFromCalculation(uuid, meting.id, admin);

  const { error } = await admin
    .from('pendiepte_metingen')
    .update({
      status:       'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('calculation_id', uuid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Herlaad meting na enrich
  const { data: metingFresh } = await admin
    .from('pendiepte_metingen')
    .select('*')
    .eq('id', meting.id)
    .single();

  processMeting(meting.id, admin).catch(e =>
    console.error('[confirm/processMeting]', e),
  );

  if (metingFresh) {
    pushMetingToGoogleSheet({
      event:               'veldmeting_confirmed',
      timestamp:           new Date().toISOString(),
      meting_id:           metingFresh.id,
      calculation_id:      uuid,
      postcode:            metingFresh.postcode,
      huisnummer:          metingFresh.huisnummer,
      straatnaam:          metingFresh.straatnaam,
      woonplaats:          metingFresh.woonplaats,
      lat:                 metingFresh.lat,
      lon:                 metingFresh.lon,
      installed_depth:     metingFresh.installed_depth,
      achieved_ra:         metingFresh.achieved_ra,
      field_gw_depth:      metingFresh.field_gw_depth,
      bro_litho_class:     metingFresh.bro_litho_class,
      depth_curve:         JSON.stringify(metingFresh.depth_curve ?? []),
      source_type:         metingFresh.source_type ?? 'monteur_app',
      measurement_quality: metingFresh.measurement_quality ?? 'goed',
    }).catch(e => console.error('[confirm/sheet-sync]', e));
  }

  return NextResponse.json({ ok: true });
}
