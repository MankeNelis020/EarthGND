import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { MonteurForm } from '@/components/meting/MonteurForm';

type Ctx = { params: Promise<{ uuid: string; locale: string }> };

export async function generateMetadata({ params }: Ctx) {
  const { uuid } = await params;
  return {
    title: `Veldmeting — EarthGND`,
    description: `Pendiepte veldmeting formulier ${uuid}`,
  };
}

export default async function MetingPage({ params }: Ctx) {
  const { uuid, locale } = await params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/meting/${uuid}`);

  // Load meting record
  const { data: meting } = await supabase
    .from('pendiepte_metingen')
    .select('*')
    .eq('calculation_id', uuid)
    .single();

  if (!meting) notFound();

  const isCalculator = meting.calculator_user_id === user.id;
  const isMonteur    = meting.monteur_user_id === user.id ||
                       meting.monteur_email === user.email;

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

  // If already confirmed, redirect to rapport
  if (meting.status === 'confirmed') {
    redirect(`/${locale}/pendiepte-rapport/${uuid}`);
  }

  // Load calculation for expected metrics
  const { data: calc } = await supabase
    .from('calculations')
    .select('id, resultaat, input, postcode, risicoklasse')
    .eq('id', uuid)
    .single();

  const resultaat   = calc?.resultaat as { dimension?: number; achievedResistance?: number } | null;
  const input       = calc?.input     as { electrodeType?: string; targetResistance?: number; rho?: number } | null;
  const isSubmitted = meting.status === 'submitted';

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
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
          </div>
        </div>

        {isSubmitted ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 text-center">
            <p className="text-lg font-semibold text-green-400">Meting ingediend</p>
            <p className="mt-2 text-sm text-white/60">
              De berekende opdrachtgever is op de hoogte gesteld. U hoeft verder niets te doen.
            </p>
          </div>
        ) : (
          <MonteurForm
            uuid={uuid}
            initialPostcode={typeof calc?.postcode === 'string' ? calc.postcode : undefined}
            initialElectrodeType={input?.electrodeType === 'lint' ? 'lint' : 'pen'}
            expectedDepth={resultaat?.dimension}
          />
        )}
      </div>
    </div>
  );
}
