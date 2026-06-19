import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

export const runtime = 'nodejs';

interface Calculation {
  id: string;
  tool: 'ohm' | 'diepte';
  postcode: string | null;
  rapport_naam: string | null;
  created_at: string;
}

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
}

interface Rapport {
  id: string;
  status: 'concept' | 'ondertekend';
  locatie: string | null;
  opdrachtgever: string | null;
  systeemtype: string | null;
  updated_at: string;
}

function fmtDate(iso: string, locale: string): string {
  const l = locale === 'nl' ? 'nl-NL' : locale === 'de' ? 'de-DE' : 'en-GB';
  return new Date(iso).toLocaleDateString(l, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Row({ href, name, meta, badge }: { href: string; name: string; meta: string; badge?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors"
    >
      <div className="flex-1 min-w-0">
        {badge && (
          <span className="mb-0.5 inline-block rounded-full border border-white/10 bg-white/3 px-1.5 py-px text-[10px] font-bold text-white/35 leading-tight">
            {badge}
          </span>
        )}
        <p className="text-sm font-semibold text-white truncate leading-tight">{name}</p>
        <p className="mt-0.5 text-[11px] text-white/30">{meta}</p>
      </div>
      <svg className="h-3.5 w-3.5 shrink-0 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111] overflow-hidden mb-3">
      <div className="border-b border-white/6 px-4 py-3">
        <h2 className="font-condensed text-sm font-bold uppercase tracking-wide text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <p className="px-4 py-5 text-center text-sm text-white/30">{text}</p>;
}

export default async function ArchiefPage({
  params: paramsPromise,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await paramsPromise;
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/dashboard/archief`);

  const t = await getTranslations({ locale, namespace: 'dashboard' });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [
    { data: calculations },
    { data: rapports },
    { data: monteurJobsRaw },
    { data: calcMetingenRaw },
  ] = await Promise.all([
    supabase
      .from('calculations')
      .select('id, tool, postcode, rapport_naam, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('inspection_reports')
      .select('id, status, locatie, opdrachtgever, systeemtype, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100),
    admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, postcode, straatnaam, woonplaats, created_at')
      .ilike('monteur_email', user.email ?? '')
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('pendiepte_metingen')
      .select('calculation_id, status, monteur_email, submitted_at, confirmed_at')
      .eq('calculator_user_id', user.id)
      .limit(200),
  ]);

  const calcs     = (calculations as Calculation[]) ?? [];
  const rapporten = (rapports as Rapport[]) ?? [];

  const diepteCalcs = calcs.filter(c => c.tool === 'diepte');
  const calcMetingen = (calcMetingenRaw as MetingInfo[]) ?? [];
  const metingMap    = new Map(calcMetingen.map(m => [m.calculation_id, m]));
  const getStatus    = (c: Calculation) => metingMap.get(c.id)?.status ?? 'none';

  const calcPhase    = diepteCalcs.filter(c => ['none', 'draft'].includes(getStatus(c)));
  const metingPhase  = diepteCalcs.filter(c => ['invited', 'submitted'].includes(getStatus(c)));
  const rapportPhase = diepteCalcs.filter(c => getStatus(c) === 'confirmed');

  const ownCalcIds = new Set(calcs.map(c => c.id));
  const monteurJobs = ((monteurJobsRaw as MonteurJob[]) ?? [])
    .filter(j => !ownCalcIds.has(j.calculation_id));

  // Archive shows items 4+ (older than the dashboard top-3)
  const archiveCalcs    = calcPhase.slice(3);
  const archiveMeting   = metingPhase.slice(3);
  const archiveMonteur  = monteurJobs.slice(3);

  const rapportItems = [
    ...rapportPhase.map(c => ({
      id:         c.id,
      type:       'pendiepte' as const,
      naam:       c.rapport_naam ?? c.postcode ?? 'Geen postcode',
      created_at: c.created_at,
      href:       `/pendiepte-rapport/${c.id}` as string,
      badge:      'Pendiepte',
    })),
    ...rapporten.map(r => ({
      id:         r.id,
      type:       'nen1010' as const,
      naam:       r.locatie ?? r.opdrachtgever ?? 'Naamloos rapport',
      created_at: r.updated_at,
      href:       `/rapport/${r.id}` as string,
      badge:      r.systeemtype ?? 'NEN 1010',
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const archiveRapports = rapportItems.slice(3);

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <div className="mx-auto max-w-3xl px-4 py-8">

        <div className="mb-5">
          <Link
            href="/dashboard"
            className="text-[11px] font-semibold text-[#E8761A]/70 hover:text-[#E8761A] transition-colors"
          >
            {t('archive.backToDashboard')}
          </Link>
          <h1 className="font-condensed mt-1 text-2xl font-black text-white">{t('archive.title')}</h1>
          <p className="mt-0.5 text-sm text-white/40">{t('archive.subtitle')}</p>
        </div>

        <SectionBlock title={t('sections.calculations')}>
          {archiveCalcs.length === 0
            ? <EmptyBlock text={t('archive.noCalculations')} />
            : archiveCalcs.map(c => (
              <Row
                key={c.id}
                href={`/pendiepte-rapport/${c.id}`}
                name={c.rapport_naam ?? c.postcode ?? 'Geen postcode'}
                meta={`${t('date.createdAt')} ${fmtDate(c.created_at, locale)}`}
              />
            ))
          }
        </SectionBlock>

        <SectionBlock title={t('sections.measurements')}>
          {archiveMeting.length === 0 && archiveMonteur.length === 0
            ? <EmptyBlock text={t('archive.noMeasurements')} />
            : (
              <>
                {archiveMeting.map(c => (
                  <Row
                    key={c.id}
                    href={`/pendiepte-rapport/${c.id}`}
                    name={c.rapport_naam ?? c.postcode ?? 'Geen postcode'}
                    meta={`${t('date.createdAt')} ${fmtDate(c.created_at, locale)}`}
                    badge={metingMap.get(c.id)?.status ?? ''}
                  />
                ))}
                {archiveMonteur.map(j => (
                  <Row
                    key={j.calculation_id}
                    href={j.status === 'submitted' ? `/pendiepte-rapport/${j.calculation_id}` : `/meting/${j.calculation_id}`}
                    name={j.straatnaam ?? j.postcode ?? 'Onbekend adres'}
                    meta={fmtDate(j.created_at, locale)}
                    badge={t('status.yourMeasurement')}
                  />
                ))}
              </>
            )
          }
        </SectionBlock>

        <SectionBlock title={t('sections.reports')}>
          {archiveRapports.length === 0
            ? <EmptyBlock text={t('archive.noReports')} />
            : archiveRapports.map(r => (
              <Row
                key={r.id}
                href={r.href}
                name={r.naam}
                meta={`${t('date.updatedAt')} ${fmtDate(r.created_at, locale)}`}
                badge={r.badge}
              />
            ))
          }
        </SectionBlock>

      </div>
    </div>
  );
}
