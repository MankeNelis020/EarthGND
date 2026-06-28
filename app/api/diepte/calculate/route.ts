import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { runGroundingAssessment } from '@/lib/pipeline';
import { logShadowPrediction } from '@/lib/soil-knowledge/shadow-logger';
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

  const aantalPennen = (kernelResult.parallelAdvice?.reason === 'driveability' && (kernelResult.parallelAdvice?.aantalPennen ?? 1) > 1)
    ? kernelResult.parallelAdvice!.aantalPennen
    : 1;

  // Log to DB — await to capture the UUID for the monteur flow
  const { data: calcRow } = await supabase.from('calculations').insert({
    user_id:         user.id,
    tool:            'diepte',
    postcode:        typeof body.postcode === 'string' ? body.postcode : null,
    risicoklasse:    kernelResult.riskClass.riskClass,
    input_values: {
      rho:              body.rho,
      targetResistance: body.targetResistance,
      groundwaterDepth: body.groundwaterDepth,
      ph:               body.ph,
      electrodeType:    body.electrodeType ?? 'pen',
      lithoClass:       body.lithoClass,
      drijfmethode:     body.drijfmethode,
    },
    result: {
      dimension:           primaryDimension,
      achievedResistance:  gemiddeld.achievedResistance,
      aantalPennen,
    },
  }).select('id').single();

  // Shadow mode logging — fire-and-forget, blokkeert de response niet.
  if (calcRow?.id) {
    logShadowPrediction(calcRow.id, typeof body.lithoClass === 'number' ? body.lithoClass : null).catch(e =>
      console.error('[diepte/calculate] shadow log mislukt:', e),
    );
  }


  return NextResponse.json({
    ...kernelResult,  // scenarios, electrodeType, rhoDry, rhoWet, gwGunstig/Gemiddeld/Ongunstig, riskClass, corrosionClass, parallelAdvice
    ...enrichment,    // confidence, plausibilityFlags, warnings, uncertaintyBand, resultValidation
    creditsRemaining,
    calculationId: calcRow?.id ?? null,  // UUID voor monteur-flow
  });
}
