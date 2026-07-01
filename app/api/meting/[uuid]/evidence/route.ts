import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { analyzeDepthCurve, analyzeDepthSegments } from '@/lib/soil-knowledge/reverse-engine';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string }> };

const LITHO_LABELS: Record<number, string> = {
  1: 'klei', 2: 'leem', 3: 'zand', 4: 'grind', 5: 'veen',
};

/** GET — bodemanalyse uit depth_curve (ρ, grondtype, Ω/m segmenten). */
export async function GET(_req: NextRequest, { params }: Ctx) {
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
    .select('*')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) return NextResponse.json({ error: 'Meting niet gevonden' }, { status: 404 });

  const isCalculator = meting.calculator_user_id === user.id;
  const isMonteur = meting.monteur_user_id === user.id || meting.monteur_email === user.email;
  if (!isCalculator && !isMonteur) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  }

  const curve = (meting.depth_curve ?? []) as Array<{ depth: number; ra: number }>;
  if (!curve.length) {
    return NextResponse.json({ points: [], segments: [], gwDepthM: null });
  }

  const gwDepth = meting.field_gw_depth ?? meting.bro_gw_depth ?? 2.0;
  const diameterMm = meting.elektrode_diameter_mm ?? undefined;
  const analyzed = analyzeDepthCurve(curve, gwDepth, diameterMm);
  const segments = analyzeDepthSegments(curve, gwDepth, diameterMm);

  const points = analyzed.map(pt => {
    let domK = 3;
    let domP = 0;
    for (const [k, p] of Object.entries(pt.classDist)) {
      if ((p ?? 0) > domP) { domP = p ?? 0; domK = parseInt(k); }
    }
    return {
      depthM:         pt.depthM,
      ra:             curve.find(c => c.depth === pt.depthM)?.ra ?? null,
      rhoApparent:    Math.round(pt.rhoApparent * 10) / 10,
      zone:           pt.zone,
      dominantClass:  domK,
      dominantLabel:  LITHO_LABELS[domK] ?? 'onbekend',
      dominantProb:   Math.round(domP * 100),
      classDist:      pt.classDist,
    };
  });

  return NextResponse.json({
    gwDepthM: gwDepth,
    points,
    segments,
    status: meting.status,
  });
}
