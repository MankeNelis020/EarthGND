import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { Link } from '@/i18n/navigation';
import { PLANS } from '@/lib/plans';
import { LogoutButton } from '@/components/ui/LogoutButton';

interface Calculation {
  id: string;
  tool: 'ohm' | 'diepte';
  postcode: string | null;
  risicoklasse: string | null;
  pdf_url: string | null;
  created_at: string;
}

interface Profile {
  plan: string;
  credits_left: number;
  credits_reset: string | null;
  email: string;
  created_at: string;
}

const riskColors: Record<string, string> = {
  I:   'border-green-500/30 bg-green-500/10 text-green-400',
  II:  'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  III: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  IV:  'border-red-500/30 bg-red-500/10 text-red-400',
};

function SuccessBanner() {
  return (
    <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
      <p className="text-sm font-semibold text-green-400">Betaling geslaagd — je credits zijn bijgeschreven.</p>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const params = await searchParams;

  const [{ data: profileRaw }, { data: calculations }] = await Promise.all([
    supabase.from('profiles').select('plan, credits_left, credits_reset, email, created_at').eq('id', user.id).single(),
    supabase.from('calculations').select('id, tool, postcode, risicoklasse, pdf_url, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
  ]);

  const profile = profileRaw as Profile | null;
  const calcs = (calculations as Calculation[]) ?? [];

  const planConfig = PLANS[(profile?.plan ?? 'gratis') as keyof typeof PLANS];
  const totalCredits = planConfig.credits;
  const creditsLeft = profile?.credits_left ?? 0;
  const creditsPct = totalCredits > 0 ? Math.round((creditsLeft / totalCredits) * 100) : 0;

  const resetDate = profile?.credits_reset
    ? new Date(profile.credits_reset).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
    : '1e van de maand';

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <div className="mx-auto max-w-4xl px-4 py-12">

        {params.checkout === 'success' && <SuccessBanner />}

        <h1 className="font-condensed mb-8 text-3xl font-black text-white">Dashboard</h1>

        {/* Credits overview */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111] p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Huidig plan</p>
              <p className="font-condensed mt-1 text-2xl font-black text-white">{planConfig.label}</p>
            </div>
            <Link
              href="/pricing"
              className="rounded-lg border border-[#E8761A]/30 px-3 py-1.5 text-xs font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
            >
              {profile?.plan === 'gratis' ? 'Upgraden' : 'Credits bijkopen'}
            </Link>
          </div>

          {totalCredits > 0 ? (
            <>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-white/60">Credits resterend</span>
                <span className="font-semibold text-white">
                  {creditsLeft} <span className="text-white/40">/ {totalCredits}</span>
                </span>
              </div>
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-[#E8761A] transition-all"
                  style={{ width: `${creditsPct}%` }}
                />
              </div>
              <p className="text-xs text-white/35">Reset op: {resetDate}</p>
            </>
          ) : (
            <p className="text-sm text-white/50">
              Gratis plan — de Weerstand Calculator is onbeperkt beschikbaar.
            </p>
          )}
        </div>

        {/* Quick links */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Link
            href="/tool/ohm"
            className="group flex items-center gap-3 rounded-xl border border-white/8 bg-[#111] px-4 py-4 hover:border-white/15 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5">
              <svg className="h-4 w-4 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-[#E8761A] transition-colors">Weerstand</p>
              <p className="text-xs text-white/40">Calculator openen</p>
            </div>
          </Link>
          <Link
            href="/tool/diepte"
            className="group flex items-center gap-3 rounded-xl border border-white/8 bg-[#111] px-4 py-4 hover:border-white/15 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5">
              <svg className="h-4 w-4 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M2 12h20" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-[#E8761A] transition-colors">Pendiepte</p>
              <p className="text-xs text-white/40">Calculator openen</p>
            </div>
          </Link>
        </div>

        {/* Calculation history */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111]">
          <div className="border-b border-white/6 px-6 py-4">
            <h2 className="font-condensed text-lg font-bold text-white">Recente berekeningen</h2>
          </div>

          {calcs.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="mb-3 text-sm text-white/40">Nog geen berekeningen</p>
              <Link href="/tool/ohm" className="text-xs text-[#E8761A] hover:underline">
                Start met de Weerstand Calculator
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {calcs.map((calc) => (
                <div key={calc.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        calc.tool === 'ohm'
                          ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                          : 'border-[#E8761A]/30 bg-[#E8761A]/10 text-[#E8761A]'
                      }`}>
                        {calc.tool === 'ohm' ? 'Weerstand' : 'Pendiepte'}
                      </span>
                      {calc.risicoklasse && (
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskColors[calc.risicoklasse] ?? 'border-white/10 text-white/40'}`}>
                          Klasse {calc.risicoklasse}
                        </span>
                      )}
                      {calc.postcode && (
                        <span className="truncate text-xs text-white/40">{calc.postcode}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-white/30">
                    {new Date(calc.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </div>
                  {calc.pdf_url && (
                    <a
                      href={calc.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-[#E8761A] hover:underline"
                    >
                      PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account */}
        <div className="rounded-2xl border border-white/8 bg-[#111] p-6">
          <h2 className="font-condensed mb-4 text-lg font-bold text-white">Account</h2>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">E-mail</span>
              <span className="text-white">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Plan</span>
              <span className="text-white">{planConfig.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Lid sinds</span>
              <span className="text-white">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                  : '—'}
              </span>
            </div>
          </div>
          <div className="mt-5 border-t border-white/6 pt-5">
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
