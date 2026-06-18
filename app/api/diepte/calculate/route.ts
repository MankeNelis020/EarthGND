import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { runGroundingAssessment } from '@/lib/pipeline';
import type { RawDiepteInput } from '@/lib/pipeline/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as RawDiepteInput;
  const result = await runGroundingAssessment(body, user.id);

  if (!result.ok) {
    if (result.confirmationRequired) {
      return NextResponse.json(
        { confirmationRequired: true, error: result.error },
        { status: 422 },
      );
    }
    // Class A without creditsRemaining = validation error (400).
    // Class A with creditsRemaining = credit exhausted (402).
    // Class D = system error (500).
    const status =
      result.error.errorClass === 'D'                           ? 500 :
      result.error.errorClass === 'A' && result.creditsRemaining != null ? 402 :
      400;
    return NextResponse.json(
      { error: result.error.message, creditsRemaining: result.creditsRemaining ?? 0 },
      { status },
    );
  }

  const { data: kernelResult, enrichment, creditsRemaining } = result;
  const gemiddeld = kernelResult.scenarios.gemiddeld as { depth?: number; length?: number; achievedResistance: number };
  const primaryDimension = gemiddeld.depth ?? gemiddeld.length ?? 0;

  // Log to DB — await to capture the UUID for the monteur flow
  const { data: calcRow, error: calcDbError } = await supabase.from('calculations').insert({
    user_id:         user.id,
    tool:            'diepte',
    postcode:        typeof body.postcode === 'string' ? body.postcode : null,
    input: {
      rho:              body.rho,
      targetResistance: body.targetResistance,
      groundwaterDepth: body.groundwaterDepth,
      ph:               body.ph,
      electrodeType:    body.electrodeType ?? 'pen',
      lithoClass:       body.lithoClass,
    },
    resultaat: { dimension: primaryDimension, achievedResistance: gemiddeld.achievedResistance },
    risicoklasse:    kernelResult.riskClass.riskClass,
  }).select('id').single();

  if (calcDbError) console.error('[diepte/calculate] DB insert failed:', calcDbError.message, calcDbError.details, calcDbError.hint);

  return NextResponse.json({
    ...kernelResult,  // scenarios, electrodeType, rhoDry, rhoWet, gwGunstig/Gemiddeld/Ongunstig, riskClass, corrosionClass, parallelAdvice
    ...enrichment,    // confidence, plausibilityFlags, warnings, uncertaintyBand, resultValidation
    creditsRemaining,
    calculationId: calcRow?.id ?? null,  // UUID voor monteur-flow
  });
}
