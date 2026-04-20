import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';

interface Calculation {
  id: string;
  tool: string;
  result: Record<string, unknown>;
  postcode: string | null;
  pdf_url: string | null;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: calculations } = await supabase
    .from('calculations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const t = await getTranslations('dashboard');
  const calcs = (calculations as Calculation[]) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#F5EFE6]">{t('title')}</h1>
          <p className="mt-1 text-[#F5EFE6]/50">
            {t('welcome')}, {user.email}
          </p>
        </div>
        <Link
          href="/tool/ohm"
          className="rounded-lg bg-[#E8761A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
        >
          {t('newCalculation')}
        </Link>
      </div>

      <h2 className="mb-4 text-lg font-semibold text-[#F5EFE6]">{t('recentCalculations')}</h2>

      {calcs.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="mb-4 text-[#F5EFE6]/40">{t('noCalculations')}</p>
          <Link
            href="/tool/ohm"
            className="rounded-lg bg-[#E8761A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
          >
            {t('newCalculation')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40">{t('date')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40">{t('tool')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40">{t('postcode')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40">{t('result')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[#F5EFE6]/40"></th>
              </tr>
            </thead>
            <tbody>
              {calcs.map((calc) => (
                <tr key={calc.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                  <td className="px-4 py-3 text-[#F5EFE6]/70">
                    {new Date(calc.created_at).toLocaleDateString('nl-NL')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#E8761A]/20 px-2.5 py-0.5 text-xs font-medium text-[#E8761A]">
                      {calc.tool === 'ohm' ? t('ohm') : t('diepte')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#F5EFE6]/70">{calc.postcode ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#F5EFE6]/60">
                    {Object.entries(calc.result)
                      .slice(0, 2)
                      .map(([, v]) => String(v))
                      .join(' · ')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {calc.pdf_url && (
                      <a
                        href={calc.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#E8761A] hover:underline"
                      >
                        {t('downloadPdf')}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
