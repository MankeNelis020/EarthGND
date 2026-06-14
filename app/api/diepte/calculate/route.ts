import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { deductCredit } from '@/lib/credits';
import {
  calcDiepte, calcLint, calcParallelRa, calcCorrosionClass,
  calcDiepteRiskClass,
} from '@/lib/calculations';

export const runtime = 'nodejs';

const ROD_DIAMETER = 0.014;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { ok, remaining } = await deductCredit(user.id);
  if (!ok) return NextResponse.json({ error: 'Onvoldoende credits', creditsRemaining: 0 }, { status: 402 });

  const body = await request.json();
  const {
    rho,
    targetResistance,
    groundwaterDepth,
    ph,
    postcode,
    electrodeType = 'pen',
    lintBurialDepth,
    lintConductorDiameter,
  } = body as {
    rho: number;
    targetResistance: number;
    groundwaterDepth: number;
    ph: number;
    postcode?: string;
    electrodeType?: 'pen' | 'lint';
    lintBurialDepth?: number;
    lintConductorDiameter?: number;
  };

  let scenarios: { gunstig: unknown; gemiddeld: unknown; ongunstig: unknown };

  if (electrodeType === 'lint') {
    scenarios = {
      gunstig:   calcLint({ rho: rho * 0.7,  targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      gemiddeld: calcLint({ rho,              targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      ongunstig: calcLint({ rho: rho * 1.5,  targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
    };
  } else {
    scenarios = {
      gunstig:   calcDiepte({ rho: rho * 0.7,  targetResistance }),
      gemiddeld: calcDiepte({ rho,              targetResistance }),
      ongunstig: calcDiepte({ rho: rho * 1.5,  targetResistance }),
    };
  }

  const gemiddeld = scenarios.gemiddeld as { depth?: number; length?: number; achievedResistance: number };
  const primaryDimension = (gemiddeld.depth ?? gemiddeld.length ?? 0);

  const riskClass = calcDiepteRiskClass({
    rho,
    groundwaterDepth,
    ph,
    depth: primaryDimension,
  });

  const corrosionClass = calcCorrosionClass(ph);

  // Parallel advice: for pen only, when depth > 12 m
  let parallelAdvice = null;
  if (electrodeType === 'pen' && primaryDimension > 12) {
    const n = primaryDimension > 20 ? 3 : 2;
    const parallel = calcParallelRa(rho, primaryDimension, ROD_DIAMETER, n);
    parallelAdvice = {
      aantalPennen: n,
      minAfstand: parallel.spacingMin,
      rParallel: parallel.rParallel,
      rSingle: parallel.rSingle,
    };
  }

  await supabase.from('calculations').insert({
    user_id: user.id,
    tool: 'diepte',
    postcode: postcode ?? null,
    input: { rho, targetResistance, groundwaterDepth, ph, electrodeType },
    resultaat: { dimension: primaryDimension, achievedResistance: gemiddeld.achievedResistance },
    risicoklasse: riskClass.riskClass,
    credit_gebruikt: true,
  });

  return NextResponse.json({
    scenarios,
    electrodeType,
    riskClass,
    corrosionClass,
    parallelAdvice,
    creditsRemaining: remaining,
  });
}
