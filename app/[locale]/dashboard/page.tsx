import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { Link } from '@/i18n/navigation';
import { PLANS } from '@/lib/plans';
import { LogoutButton } from '@/components/ui/LogoutButton';

interface MetingInfo {
  status: string;
  monteur_email: string | null;
}

interface Calculation {
  id: string;
  tool: 'ohm' | 'diepte';
  postcode: string | null;
  rapport_naam: string | null;
  risicoklasse: string | null;
  pdf_url: string | null;
  created_at: string;
  pendiepte_metingen: MetingInfo[];
}

interface Rapport {
  id: string;
  status: 'concept' | 'ondertekend';
  locatie: string | null;
  opdrachtgever: string | null;
  systeemtype: string | null;
  datum_uitvoering: string | null;
  updated_at: string;
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

const metingStatusBadge: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Berekend',            cls: 'border-white/15 bg-white/5 text-white/50' },
  invited:   { label: 'Monteur uitgenodigd', cls: 'border-blue-500/30 bg-blue-500/5 text-blue-400' },
  submitted: { label: 'Meting ingediend',    cls: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400' },
  confirmed: { label: 'Rapport bevestigd',   cls: 'border-green-500/30 bg-green-500/5 text-green-400' },
  none:      { label: 'Berekend',            cls: 'border-white/15 bg-white/5 text-white/50' },
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

  const [{ data: profileRaw }, { data: calculations }, { data: rapports }] = await Promise.all([
    supabase
      .from('profiles')
      .select('plan, credits_left, credits_reset, email, created_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('calculations')
      .select('id, tool, postcode, rapport_naam, risicoklasse, pdf_url, created_at, pendiepte_metingen(status, monteur_email)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('inspection_reports')
      .select('id, status, locatie, opdrachtgever, systeemtype, datum_uitvoering, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(8),
  ]);

  const profile = profileRaw as Profile | null;
  const calcs = (calculations as Calculation[]) ?? [];
  const rapporten = (rapports as Rapport[]) ?? [];

  const planConfig = PLANS[(profile?.plan ?? 'gratis') as keyof typeof PLANS];
  const totalCredits = planConfig.credits;
  const creditsLeft = profile?.credits_left ?? 0;
  const creditsPct = totalCredits > 0 ? Math.round((creditsLeft / totalCredits) * 100) : 0;

  const resetDate = profile?.credits_reset
    ? new Date(profile.credits_reset).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
    : '1e van de maand';

  // Split pendiepte calculations that have a flow active from plain ohm/diepte list
  const diepteCalcs = calcs.filter(c => c.tool === 'diepte');
  const ohmCalcs    = calcs.filter(c => c.tool === 'ohm');

  // Pendiepte jobs with any meting status (including those with no meting yet)
  const pendiepteJobs = diepteCalcs;

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
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <Link
            href="/rapport/nieuw"
            className="group flex items-center gap-3 rounded-xl border border-[#E8761A]/20 bg-[#E8761A]/5 px-4 py-4 hover:border-[#E8761A]/35 transition-colors col-span-2 sm:col-span-1"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E8761A]/20 bg-[#E8761A]/10">
              <svg className="h-4 w-4 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#E8761A] group-hover:text-[#f08530] transition-colors">Opleverrapport</p>
              <p className="text-xs text-white/40">NEN 1010 rapport aanmaken</p>
            </div>
          </Link>
        </div>

        {/* Pendiepte jobs — one entry per UUID, all states */}
        {pendiepteJobs.length > 0 && (
          <div className="mb-6 rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold text-white">Pendiepte berekeningen</h2>
              <p className="mt-0.5 text-xs text-white/40">
                Klik om het voorbereidend rapport, de veldmeting of het opleverrapport te openen
              </p>
            </div>
            <div className="divide-y divide-white/5">
              {pendiepteJobs.map((calc) => {
                const meting = calc.pendiepte_metingen?.[0] ?? null;
                const metingStatus = meting?.status ?? 'none';
                const badge = metingStatusBadge[metingStatus] ?? metingStatusBadge.none;
                const showAction = metingStatus === 'submitted';

                return (
                  <Link
                    key={calc.id}
                    href={`/pendiepte-rapport/${calc.id}`}
                    className="flex items-center gap-3 px-6 py-4 hover:bg-white/3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {calc.risicoklasse && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskColors[calc.risicoklasse] ?? 'border-white/10 text-white/40'}`}>
                            Klasse {calc.risicoklasse}
                          </span>
                        )}
                        {showAction && (
                          <span className="shrink-0 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                            Actie vereist
                          </span>
                        )}
                      </div>
                      {calc.rapport_naam ? (
                        <p className="text-sm font-semibold text-white truncate">{calc.rapport_naam}</p>
                      ) : (
                        <p className="text-sm text-white/50">
                          {calc.postcode ?? 'Geen postcode'}
                        </p>
                      )}
                      {meting?.monteur_email && (
                        <p className="text-xs text-white/30">{meting.monteur_email}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-white/30">
                      {new Date(calc.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </div>
                    <svg className="h-4 w-4 shrink-0 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* NEN 1010 rapport history */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111]">
          <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
            <h2 className="font-condensed text-lg font-bold text-white">NEN 1010 opleverrapporten</h2>
            <Link
              href="/rapport/nieuw"
              className="rounded-lg border border-[#E8761A]/30 px-3 py-1.5 text-xs font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
            >
              + Nieuw
            </Link>
          </div>

          {rapporten.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="mb-3 text-sm text-white/40">Nog geen opleverrapporten</p>
              <Link href="/rapport/nieuw" className="text-xs text-[#E8761A] hover:underline">
                Maak uw eerste NEN 1010 deel 6 rapport aan
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {rapporten.map((r) => (
                <Link
                  key={r.id}
                  href={`/rapport/${r.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-white/3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        r.status === 'ondertekend'
                          ? 'border-green-500/30 bg-green-500/10 text-green-400'
                          : 'border-yellow-500/20 bg-yellow-500/8 text-yellow-400'
                      }`}>
                        {r.status === 'ondertekend' ? 'Ondertekend' : 'Concept'}
                      </span>
                      {r.systeemtype && (
                        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/40">
                          {r.systeemtype}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-semibold text-white">
                      {r.locatie ?? r.opdrachtgever ?? 'Naamloos rapport'}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs text-white/30">
                    {new Date(r.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Weerstand calculation history */}
        {ohmCalcs.length > 0 && (
          <div className="mb-6 rounded-2xl border border-white/8 bg-[#111]">
            <div className="border-b border-white/6 px-6 py-4">
              <h2 className="font-condensed text-lg font-bold text-white">Weerstand berekeningen</h2>
            </div>
            <div className="divide-y divide-white/5">
              {ohmCalcs.map((calc) => (
                <div key={calc.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                        Weerstand
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
          </div>
        )}

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
