import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Link } from '@/i18n/navigation';
import { PLANS } from '@/lib/plans';
import { toIntlLocale } from '@/lib/locale-utils';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { PostAuthRedirect } from '@/components/auth/PostAuthRedirect';
import { DashboardSections } from '@/components/dashboard/DashboardSections';
import { ColleaguesSection } from '@/components/dashboard/ColleaguesSection';

export const runtime = 'nodejs';

interface MetingInfo {
  calculation_id: string;
  status: string;
  monteur_email: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
}

interface MonteurJob {
  calculation_id: string;
  status: string;
  postcode: string | null;
  straatnaam: string | null;
  woonplaats: string | null;
  created_at: string;
  submitted_at: string | null;
  confirmed_at: string | null;
}

interface Calculation {
  id: string;
  tool: 'ohm' | 'diepte';
  postcode: string | null;
  rapport_naam: string | null;
  pdf_url: string | null;
  created_at: string;
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
  credits_purchased: number;
  credits_reset: string | null;
  email: string;
  created_at: string;
}

export default async function DashboardPage({
  params: paramsPromise,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { locale } = await paramsPromise;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/dashboard`);

  const params = await searchParams;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [
    { data: profileRaw },
    { data: calculations },
    { data: rapports },
    { data: monteurJobsRaw },
    { data: calcMetingenRaw },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('plan, credits_left, credits_purchased, credits_reset, email, created_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('calculations')
      .select('id, tool, postcode, rapport_naam, pdf_url, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('inspection_reports')
      .select('id, status, locatie, opdrachtgever, systeemtype, datum_uitvoering, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(8),
    admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, postcode, straatnaam, woonplaats, created_at, submitted_at, confirmed_at')
      .ilike('monteur_email', user.email ?? '')
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, monteur_email, submitted_at, confirmed_at')
      .eq('calculator_user_id', user.id)
      .limit(50),
  ]);

  const profile   = profileRaw as Profile | null;
  const calcs     = (calculations as Calculation[]) ?? [];
  const rapporten = (rapports as Rapport[]) ?? [];

  const planConfig      = PLANS[(profile?.plan ?? 'gratis') as keyof typeof PLANS];
  const totalCredits    = planConfig.credits;
  const creditsLeft     = profile?.credits_left ?? 0;
  const creditsPurchased = profile?.credits_purchased ?? 0;
  const subscriptionCredits = Math.max(0, creditsLeft - creditsPurchased);
  const creditsPct = totalCredits > 0
    ? Math.min(100, Math.round((subscriptionCredits / totalCredits) * 100))
    : 0;

  const intlLocale = toIntlLocale(locale);
  const resetDate = profile?.credits_reset
    ? new Date(profile.credits_reset).toLocaleDateString(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : profile?.plan !== 'gratis'
      ? '—'
      : null;

  const diepteCalcs = calcs.filter(c => c.tool === 'diepte');

  const calcMetingen = (calcMetingenRaw as MetingInfo[]) ?? [];
  const metingMap    = new Map(calcMetingen.map(m => [m.calculation_id, m]));
  const getStatus    = (c: Calculation) => metingMap.get(c.id)?.status ?? 'none';

  const calcPhase    = diepteCalcs.filter(c => ['none', 'draft'].includes(getStatus(c)));
  const metingPhase  = diepteCalcs.filter(c => ['invited', 'submitted'].includes(getStatus(c)));
  const rapportPhase = diepteCalcs.filter(c => getStatus(c) === 'confirmed');

  const ownCalcIds  = new Set(calcs.map(c => c.id));
  const monteurJobs = ((monteurJobsRaw as MonteurJob[]) ?? [])
    .filter(j => !ownCalcIds.has(j.calculation_id));

  // Normalise to a single flat list for the rapport section
  const rapportItems = [
    ...rapportPhase.map(c => ({
      id:         c.id,
      type:       'pendiepte' as const,
      label:      '',
      status:     'confirmed',
      naam:       c.rapport_naam ?? c.postcode ?? 'Geen postcode',
      created_at: c.created_at,
      href:       `/pendiepte-rapport/${c.id}`,
    })),
    ...rapporten.map(r => ({
      id:         r.id,
      type:       'nen1010' as const,
      label:      r.systeemtype ?? '',
      status:     r.status,
      naam:       r.locatie ?? r.opdrachtgever ?? 'Naamloos rapport',
      created_at: r.updated_at,
      href:       `/rapport/${r.id}`,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="min-h-screen bg-canvas">
      <PostAuthRedirect />
      <div className="mx-auto max-w-3xl px-4 py-10">

        {params.checkout === 'success' && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
            <p className="text-sm font-semibold text-green-400">Betaling geslaagd — je credits zijn bijgeschreven.</p>
          </div>
        )}

        <h1 className="font-condensed mb-6 text-3xl font-black text-white">Dashboard</h1>

        {/* ── Credits + quick actions ────────────────────────────────────── */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111]">
          <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Huidig plan</p>
              <p className="font-condensed mt-0.5 text-xl font-black text-white">{planConfig.label}</p>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 rounded-lg border border-[#E8761A]/30 px-3 py-1.5 text-xs font-semibold text-[#E8761A] hover:bg-[#E8761A]/8 transition-colors"
            >
              {profile?.plan === 'gratis' ? 'Upgraden' : 'Credits bijkopen'}
            </Link>
          </div>
          <div className="px-6 py-4">
            {totalCredits > 0 || creditsLeft > 0 ? (
              <>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-white/50">Credits resterend</span>
                  <span className="font-semibold text-white">
                    {creditsLeft}
                    {totalCredits > 0 && (
                      <span className="text-white/30"> ({subscriptionCredits} abo / {totalCredits})</span>
                    )}
                  </span>
                </div>
                {totalCredits > 0 && (
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-[#E8761A] transition-all" style={{ width: `${creditsPct}%` }} />
                  </div>
                )}
                {creditsPurchased > 0 && (
                  <p className="mb-1 text-[11px] text-white/40">
                    Inclusief {creditsPurchased} gekochte credit{creditsPurchased === 1 ? '' : 's'} (vervallen niet)
                  </p>
                )}
                {resetDate && (
                  <p className="text-[11px] text-white/30">Abonnement reset op: {resetDate}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-white/40">Gratis plan — Weerstand Calculator onbeperkt beschikbaar.</p>
            )}
          </div>
          {/* Quick links inside credits card */}
          <div className="grid grid-cols-3 divide-x divide-white/6 border-t border-white/6">
            {[
              { href: '/tool/ohm',    label: 'Weerstand',   sub: 'Calculator' },
              { href: '/tool/diepte', label: 'Pendiepte',   sub: 'Calculator' },
              { href: '/rapport/nieuw', label: 'NEN 1010',  sub: 'Nieuw rapport' },
            ].map(({ href, label, sub }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center gap-0.5 py-3.5 hover:bg-white/3 transition-colors"
              >
                <span className="text-xs font-semibold text-white group-hover:text-[#E8761A] transition-colors">{label}</span>
                <span className="text-[10px] text-white/30">{sub}</span>
              </Link>
            ))}
          </div>
        </div>

        <ColleaguesSection />

        {/* ── Workflow sections (client component handles delete + modal) ── */}
        <DashboardSections
          locale={locale}
          calcPhase={calcPhase.map(c => ({
            id:          c.id,
            postcode:    c.postcode,
            rapport_naam: c.rapport_naam,
            created_at:  c.created_at,
          }))}
          metingPhase={metingPhase.map(c => ({
            id:                   c.id,
            postcode:             c.postcode,
            rapport_naam:         c.rapport_naam,
            created_at:           c.created_at,
            metingStatus:         metingMap.get(c.id)?.status,
            monteurEmail:         metingMap.get(c.id)?.monteur_email,
            metingSubmittedAt:    metingMap.get(c.id)?.submitted_at ?? null,
            metingConfirmedAt:    metingMap.get(c.id)?.confirmed_at ?? null,
          }))}
          monteurJobs={monteurJobs.map(j => ({
            calculation_id: j.calculation_id,
            status:         j.status,
            postcode:       j.postcode,
            straatnaam:     j.straatnaam,
            woonplaats:     j.woonplaats,
            created_at:     j.created_at,
          }))}
          rapportPhase={rapportItems}
        />

        {/* ── Account ───────────────────────────────────────────────────── */}
        <div className="mt-6 rounded-2xl border border-white/8 bg-[#111]">
          <div className="border-b border-white/6 px-6 py-4">
            <h2 className="font-condensed text-base font-bold text-white">Account</h2>
          </div>
          <div className="divide-y divide-white/5 px-6">
            {[
              { label: 'E-mail', value: user.email ?? '—' },
              { label: 'Plan',   value: planConfig.label },
              {
                label: 'Lid sinds',
                value: profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })
                  : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3 text-sm">
                <span className="text-white/40">{label}</span>
                <span className="text-white">{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/6 px-6 py-4 flex items-center justify-between gap-4">
            <Link
              href="/instellingen"
              className="text-sm font-semibold text-[#E8761A] hover:text-[#d06510] transition-colors"
            >
              Instellingen →
            </Link>
            <LogoutButton />
          </div>
        </div>

      </div>
    </div>
  );
}
