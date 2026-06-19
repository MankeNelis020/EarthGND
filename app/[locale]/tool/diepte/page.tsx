import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { DiepteCalculator } from '@/components/tools/DiepteCalculator';
import { Link } from '@/i18n/navigation';

export const runtime = 'nodejs';
export const metadata = {
  title: 'Pendiepte Calculator — EarthGND',
  description: 'Bereken de benodigde aardpenlengte op basis van BRO bodemdata. Inclusief Ra-haalbaarheidscheck, corrosieclassificatie en risicoklasse I–IV.',
};

type SearchParams = Promise<{ target?: string; label?: string }>;
type Params = Promise<{ locale: string }>;

export default async function DieptePage({
  params: paramsPromise,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await paramsPromise; // locale not needed; auth gate uses i18n links
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0d0d0d]">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-3 py-1 text-xs font-semibold tracking-wider text-[#E8761A]">
              Dwight-formule · BRO bodemdata · NEN 1010 / NEN 62305
            </div>
            <h1 className="font-condensed text-3xl font-black text-white sm:text-4xl">
              Pendiepte Calculator
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Exacte penlengte op basis van locatie en bodem. Inclusief Ra-haalbaarheidscheck.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111] p-8 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#E8761A]/20 bg-[#E8761A]/8">
              <svg className="h-6 w-6 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-bold text-white">Log in om Pendiepte te gebruiken</h2>
            <p className="mb-6 text-sm text-white/50">
              De Pendiepte Calculator is beschikbaar voor gebruikers met een actief plan. Maak een gratis account aan en kies een plan.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
              >
                Inloggen
              </Link>
              <Link
                href="/pricing"
                className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white transition-colors"
              >
                Plannen bekijken
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan ?? 'gratis';
  const isPaid = plan !== 'gratis';

  // Free user
  if (!isPaid) {
    return (
      <div className="min-h-screen bg-[#0d0d0d]">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-3 py-1 text-xs font-semibold tracking-wider text-[#E8761A]">
              Dwight-formule · BRO bodemdata · NEN 1010 / NEN 62305
            </div>
            <h1 className="font-condensed text-3xl font-black text-white sm:text-4xl">
              Pendiepte Calculator
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Exacte penlengte op basis van locatie en bodem. Inclusief Ra-haalbaarheidscheck.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8761A]/20 bg-[#E8761A]/5 p-8 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#E8761A]/30 bg-[#E8761A]/10">
              <svg className="h-6 w-6 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-bold text-white">Pendiepte vereist een betaald plan</h2>
            <p className="mb-2 text-sm text-white/60">
              Je gebruikt momenteel het <span className="font-semibold text-white">Gratis</span> plan. De Pendiepte Calculator is beschikbaar vanaf het Starter plan.
            </p>
            <p className="mb-6 text-xs text-white/35">Inclusief BRO bodemdata, Ra-haalbaarheidscheck en PDF rapport.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/pricing"
                className="rounded-xl bg-[#E8761A] px-6 py-3 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
              >
                Upgraden — vanaf €10/maand
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white transition-colors"
              >
                Terug naar dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Paid user — show calculator
  const params = await searchParams;
  const initialTarget = params.target ? Number(params.target) : undefined;
  const initialLabel = params.label;

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-3 py-1 text-xs font-semibold tracking-wider text-[#E8761A]">
            Dwight-formule · BRO bodemdata · NEN 1010 / NEN 62305
          </div>
          <h1 className="font-condensed text-3xl font-black text-white sm:text-4xl">
            Pendiepte Calculator
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Exacte penlengte of lintlengte op basis van locatie en bodem. Inclusief Ra-haalbaarheidscheck.
          </p>
        </div>
        <DiepteCalculator initialTarget={initialTarget} initialLabel={initialLabel} />
      </div>
    </div>
  );
}
