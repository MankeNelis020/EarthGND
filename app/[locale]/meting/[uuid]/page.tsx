import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { MonteurForm, type SavedMeting } from '@/components/meting/MonteurForm';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ uuid: string; locale: string }> };

export async function generateMetadata() {
  return {
    title: 'Veldmeting — EarthGND',
    description: 'Pendiepte veldmeting formulier',
  };
}

export default async function MetingPage({ params }: Ctx) {
  const { uuid, locale } = await params;

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/meting/${uuid}`);

  // Use admin client — monteur_user_id is NULL on first visit so RLS SELECT
  // policy (auth.uid() = monteur_user_id) would block the regular client.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: meting } = await admin
    .from('pendiepte_metingen')
    .select('*')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) notFound();

  const isCalculator = meting.calculator_user_id === user.id;
  const isMonteur    = meting.monteur_user_id === user.id ||
                       meting.monteur_email?.toLowerCase() === user.email?.toLowerCase();

  if (!isCalculator && !isMonteur) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="mb-2 text-2xl font-bold text-[#F5EFE6]">Geen toegang</h1>
          <p className="text-sm text-[#F5EFE6]/60">
            Dit formulier is alleen toegankelijk voor de aangewezen monteur.
          </p>
        </div>
      </div>
    );
  }

  // Claim monteur_user_id on first visit (admin client bypasses RLS)
  if (isMonteur && !meting.monteur_user_id) {
    await admin
      .from('pendiepte_metingen')
      .update({ monteur_user_id: user.id })
      .eq('calculation_id', uuid);
  }

  if (meting.status === 'confirmed') {
    redirect(`/${locale}/pendiepte-rapport/${uuid}`);
  }

  const { data: calc } = await admin
    .from('calculations')
    .select('id, result, input_values, postcode')
    .eq('id', uuid)
    .single();

  const resultaat = calc?.result       as { dimension?: number; achievedResistance?: number; aantalPennen?: number } | null;
  const input     = calc?.input_values as {
    electrodeType?: string;
    targetResistance?: number;
    drijfmethode?: string;
    electrodeDiameterMm?: number;
  } | null;
  const isSubmitted = meting.status === 'submitted';

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">EarthGND</p>
          <h1 className="mt-1 text-2xl font-bold text-[#F5EFE6]">Pendiepte veldmeting</h1>
          {calc?.postcode && (
            <p className="mt-1 text-sm text-[#F5EFE6]/60">Locatie: {calc.postcode}</p>
          )}
        </div>

        {/* Expected metrics banner */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/60">
            Verwacht op basis van berekening
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-white/50">Elektrode type</p>
              <p className="text-sm font-semibold text-white">
                {input?.electrodeType === 'lint' ? 'Lint' : 'Verticale pen'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/50">Doelweerstand</p>
              <p className="text-sm font-semibold text-white">≤ {input?.targetResistance ?? '—'} Ω</p>
            </div>
            <div>
              <p className="text-[10px] text-white/50">Verwachte diepte</p>
              <p className="text-sm font-semibold text-white">
                {resultaat?.dimension != null ? `${resultaat.dimension.toFixed(2)} m` : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/50">Berekend Ra</p>
              <p className="text-sm font-semibold text-white">
                {resultaat?.achievedResistance != null ? `${resultaat.achievedResistance.toFixed(2)} Ω` : '—'}
              </p>
            </div>
            {(resultaat?.aantalPennen ?? 1) > 1 && (
              <div className="col-span-2 sm:col-span-2">
                <p className="text-[10px] text-white/50">Aanbevolen configuratie</p>
                <p className="text-sm font-semibold text-white">
                  {resultaat!.aantalPennen} pennen parallel
                  {input?.drijfmethode && ` · ${input.drijfmethode}`}
                </p>
              </div>
            )}
          </div>
        </div>

        {isSubmitted ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 text-center">
            <p className="text-lg font-semibold text-green-400">Meting ingediend</p>
            <p className="mt-2 text-sm text-white/60">
              De opdrachtgever is op de hoogte gesteld. U hoeft verder niets te doen.
            </p>
          </div>
        ) : (
          <MonteurForm
            uuid={uuid}
            initialPostcode={typeof calc?.postcode === 'string' ? calc.postcode : undefined}
            initialElectrodeType={input?.electrodeType === 'lint' ? 'lint' : 'pen'}
            expectedDepth={resultaat?.dimension}
            recommendedAantalPennen={resultaat?.aantalPennen ?? 1}
            recommendedDrijfmethode={input?.drijfmethode}
            initialElectrodeDiameterMm={
              typeof input?.electrodeDiameterMm === 'number' ? input.electrodeDiameterMm : undefined
            }
            savedMeting={meting as SavedMeting}
          />
        )}
      </div>
    </div>
  );
}
