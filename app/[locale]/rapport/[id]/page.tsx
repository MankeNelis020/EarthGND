import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { RapportForm } from '@/components/rapport/RapportForm';
import { Link } from '@/i18n/navigation';
import type { InspectionReport, Meting } from '@/lib/types/rapport';

type Ctx = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Ctx) {
  const { id } = await params;
  return {
    title: `Opleverrapport — EarthGND`,
    description: `NEN 1010 deel 6 aarding opleverrapport ${id}`,
  };
}

export default async function RapportPage({ params }: Ctx) {
  const { id } = await params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: report }, { data: metingen }] = await Promise.all([
    supabase
      .from('inspection_reports')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('metingen')
      .select('*')
      .eq('rapport_id', id)
      .order('volgorde'),
  ]);

  if (!report) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/40 hover:border-white/20 hover:text-white/70 transition-colors"
            aria-label="Terug naar dashboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#E8761A]">
                NEN 1010 deel 6
              </span>
              {report.status === 'ondertekend' && (
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                  Ondertekend
                </span>
              )}
              {report.status === 'concept' && (
                <span className="rounded-full border border-yellow-500/20 bg-yellow-500/8 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
                  Concept
                </span>
              )}
            </div>
            <h1 className="font-condensed mt-0.5 truncate text-xl font-black text-white">
              {report.locatie ?? report.opdrachtgever ?? 'Aarding Opleverrapport'}
            </h1>
          </div>
        </div>

        {/* Form */}
        <RapportForm
          initialReport={report as InspectionReport}
          initialMetingen={(metingen ?? []) as Meting[]}
        />
      </div>
    </div>
  );
}
