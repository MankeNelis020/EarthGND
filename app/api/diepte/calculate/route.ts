import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { deductCredit } from '@/lib/credits';
import { calcDiepte, calcDiepteRiskClass } from '@/lib/calculations';

export const runtime = 'nodejs';

const ROD_DIAMETER = 0.014;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const { ok, remaining } = await deductCredit(user.id);
  if (!ok) {
    return NextResponse.json({ error: 'Onvoldoende credits', creditsRemaining: 0 }, { status: 402 });
  }

  const body = await request.json();
  const { rho, targetResistance, groundwaterDepth, ph, postcode } = body as {
    rho: number;
    targetResistance: number;
    groundwaterDepth: number;
    ph: number;
    postcode?: string;
  };

  const baseInput = { targetResistance, rodDiameter: ROD_DIAMETER, groundwaterDepth, ph };

  const scenarios = {
    gunstig:   calcDiepte({ rho: rho * 0.7,  ...baseInput }),
    gemiddeld: calcDiepte({ rho,              ...baseInput }),
    ongunstig: calcDiepte({ rho: rho * 1.5,  ...baseInput }),
  };

  const riskClass = calcDiepteRiskClass({
    rho,
    groundwaterDepth,
    ph,
    depth: scenarios.gemiddeld.depth,
  });

  const gemiddeld = scenarios.gemiddeld;

  // Parallel rod advice
  const parallelAdvice = gemiddeld.depth > 12 ? {
    aantalPennen: gemiddeld.depth > 20 ? 3 : 2,
    minAfstand: Math.ceil(gemiddeld.depth * 2),
  } : null;

  await supabase.from('calculations').insert({
    user_id: user.id,
    tool: 'diepte',
    postcode: postcode ?? null,
    input: { rho, targetResistance, groundwaterDepth, ph },
    resultaat: { depth: gemiddeld.depth, achievedResistance: gemiddeld.achievedResistance },
    risicoklasse: riskClass.riskClass,
    credit_gebruikt: true,
  });

  return NextResponse.json({ scenarios, riskClass, parallelAdvice, creditsRemaining: remaining });
}
