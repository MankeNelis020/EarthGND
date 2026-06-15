import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { deductCredit } from '@/lib/credits';
import {
  calcDiepte, calcLint, calcParallelRa, calcCorrosionClass,
  calcDiepteRiskClass, lithoClassToRhoDry, lithoClassToRhoWet, calcRhoEffective,
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
    lithoClass,
  } = body as {
    rho: number;
    targetResistance: number;
    groundwaterDepth: number;
    ph: number;
    postcode?: string;
    electrodeType?: 'pen' | 'lint';
    lintBurialDepth?: number;
    lintConductorDiameter?: number;
    lithoClass?: number;
  };

  // ─── Two-layer ρ values ───────────────────────────────────────────────────
  // When lithoClass is known (BRO data), use calibrated dry/wet values.
  // Otherwise fall back to physics-based factors relative to the moist rho.
  const rhoDry = lithoClass ? lithoClassToRhoDry(lithoClass) : Math.round(rho * 2.2);
  const rhoWet = lithoClass ? lithoClassToRhoWet(lithoClass) : Math.round(rho * 0.45);

  // ─── Seasonal groundwater depth variation ─────────────────────────────────
  // groundwaterDepth = GHG (hoogste grondwaterstand, meest gunstig).
  // Gemiddeld en ongunstig zijn schattingen van seizoensdalingen.
  const gwGunstig   = groundwaterDepth;          // natte periode: GHG
  const gwGemiddeld = groundwaterDepth + 1.5;    // gemiddeld jaar
  const gwOngunstig = groundwaterDepth + 3.0;    // droge zomer

  let scenarios: { gunstig: unknown; gemiddeld: unknown; ongunstig: unknown };

  if (electrodeType === 'lint') {
    const burial = lintBurialDepth ?? 0.8;
    // Horizontal lint at fixed depth: use dry or wet based on whether burial > gwDepth
    scenarios = {
      gunstig:   calcLint({ rho: burial < gwGunstig   ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      gemiddeld: calcLint({ rho: burial < gwGemiddeld ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
      ongunstig: calcLint({ rho: burial < gwOngunstig ? rhoWet : rhoDry, targetResistance, burialDepth: lintBurialDepth, conductorDiameter: lintConductorDiameter }),
    };
  } else {
    scenarios = {
      gunstig:   calcDiepte({ rho, targetResistance, gwDepth: gwGunstig,   rhoDry, rhoWet }),
      gemiddeld: calcDiepte({ rho, targetResistance, gwDepth: gwGemiddeld, rhoDry, rhoWet }),
      ongunstig: calcDiepte({ rho, targetResistance, gwDepth: gwOngunstig, rhoDry, rhoWet }),
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

  // Parallel advice: for pen only, when single rod depth > 12 m
  let parallelAdvice = null;
  if (electrodeType === 'pen' && primaryDimension > 12) {
    const n = primaryDimension > 20 ? 3 : 2;
    // Use effective ρ at the rod depth for the gemiddeld scenario
    const rhoForParallel = calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, primaryDimension);
    const parallel = calcParallelRa(rhoForParallel, primaryDimension, ROD_DIAMETER, n);
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
    input: { rho, targetResistance, groundwaterDepth, ph, electrodeType, lithoClass },
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
    // Two-layer model info — used by UI for cross-section and graph
    rhoDry,
    rhoWet,
    gwGunstig,
    gwGemiddeld,
    gwOngunstig,
  });
}
