import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import type { Systeemtype } from '@/lib/types/rapport';

type SearchParams = Promise<{
  scan?: string;
  systeemtype?: string;
  locatie?: string;
}>;

// Server page: creates a new concept rapport and redirects to it.
export default async function NieuwRapportPage({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const params = await searchParams;
  const calculationId = params.scan ?? null;

  let scanContext: Record<string, unknown> | null = null;
  const systeemtype: Systeemtype | null = (params.systeemtype as Systeemtype) ?? null;
  let locatie: string | null = params.locatie ?? null;

  // Pre-fill from linked calculation if provided
  if (calculationId) {
    const { data: calc } = await supabase
      .from('calculations')
      .select('*')
      .eq('id', calculationId)
      .eq('user_id', user.id)
      .single();

    if (calc) {
      scanContext = {
        postcode:          calc.postcode ?? undefined,
        rho:               calc.rho ?? undefined,
        grondwaterstand_m: calc.grondwaterstand_m ?? undefined,
        ph:                calc.ph ?? undefined,
        voorspeld_diepte_m: calc.voorspeld_diepte_m ?? undefined,
        voorspeld_ra_ohm:  calc.voorspeld_ra_ohm ?? undefined,
        risicoklasse:      calc.risicoklasse ?? undefined,
        databron:          calc.databron ?? undefined,
        berekend_op:       calc.created_at ?? undefined,
      };
      if (!locatie && calc.postcode) locatie = calc.postcode;
    }
  }

  const { data: report, error } = await supabase
    .from('inspection_reports')
    .insert({
      user_id:        user.id,
      status:         'concept',
      versie:         1,
      calculation_id: calculationId,
      scan_context:   scanContext,
      systeemtype:    systeemtype,
      locatie:        locatie,
      audit_trail:    [],
    })
    .select('id')
    .single();

  if (error || !report) {
    // Fallback: show an error rather than a blank crash
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center max-w-sm">
          <p className="text-sm font-semibold text-red-400 mb-2">Aanmaken mislukt</p>
          <p className="text-xs text-white/40">{error?.message ?? 'Onbekende fout'}</p>
        </div>
      </div>
    );
  }

  redirect(`/rapport/${report.id}`);
}
