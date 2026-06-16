import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { deductCredit } from '@/lib/credits';
import {
  calcDiepte, calcLint, calcParallelRa, calcCorrosionClass,
  calcDiepteRiskClass, lithoClassToRhoDry, lithoClassToRhoWet, calcRhoEffective,
  type DiepteResult,
} from '@/lib/calculations';

export const runtime = 'nodejs';

const ROD_DIAMETER = 0.014;
// Realistic maximum depth for a single vertical grounding rod.
// Above this the Dwight model's assumptions break down and the recommendation
// becomes physically impractical. Scenarios are capped here and a flag is set
// so the UI can pivot to multi-rod / horizontal advice.
const Z_MAX_REALISTIC = 9; // m (soft limit; absolute hard cap in practice)

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
    rhoDryOverride,
    hasBroProfile,
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
    rhoDryOverride?: number;   // actual rho of BRO samples above GHG
    hasBroProfile?: boolean;   // true when BRO profile data was applied by user
  };

  // ─── Two-layer ρ values ───────────────────────────────────────────────────
  // Step 1 fix: when the user applied BRO profile data ("Toepassen"), the slider
  // value `rho` IS the wet-zone representative (dominant below-GHG value).
  // Use it directly instead of the lithoClass table entry, which was using the
  // top-layer class (often veen class 5 → 400 Ω·m) for the whole column.
  // Fallback: existing lithoClass-table or ratio behaviour when no profile is present.
  const rhoDry = rhoDryOverride ?? (lithoClass ? lithoClassToRhoDry(lithoClass) : Math.round(rho * 2.2));
  const rhoWet = hasBroProfile ? rho : (lithoClass ? lithoClassToRhoWet(lithoClass) : Math.round(rho * 0.45));

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

  // ─── Step 3: depth clamp ──────────────────────────────────────────────────
  // Single vertical rod beyond Z_MAX_REALISTIC is physically impractical.
  // Cap the depth and set a flag; the UI pivots to multi-rod / horizontal advice.
  let diepteGecapt = false;
  if (electrodeType === 'pen') {
    const capPen = (r: DiepteResult): DiepteResult => {
      if (r.depth <= Z_MAX_REALISTIC) return r;
      diepteGecapt = true;
      return { depth: Z_MAX_REALISTIC, achievedResistance: r.achievedResistance, converged: false };
    };
    scenarios = {
      gunstig:   capPen(scenarios.gunstig as DiepteResult),
      gemiddeld: capPen(scenarios.gemiddeld as DiepteResult),
      ongunstig: capPen(scenarios.ongunstig as DiepteResult),
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

  // Parallel advice: for pen only, when single rod depth > 12 m (before capping)
  let parallelAdvice = null;
  if (electrodeType === 'pen' && (primaryDimension > 12 || diepteGecapt)) {
    const n = 3;
    const adviceDepth = diepteGecapt ? Z_MAX_REALISTIC : primaryDimension;
    const rhoForParallel = calcRhoEffective(rhoDry, rhoWet, gwGemiddeld, adviceDepth);
    const parallel = calcParallelRa(rhoForParallel, adviceDepth, ROD_DIAMETER, n);
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
    diepteGecapt,
    // Two-layer model info — used by UI for cross-section and graph
    rhoDry,
    rhoWet,
    gwGunstig,
    gwGemiddeld,
    gwOngunstig,
  });
}

