import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/utils/supabase/server';
import { WorkPreparationPanel } from '@/components/work-preparation/WorkPreparationPanel';
import {
  buildReadiness,
  loadKlicRequest,
  loadOwnedCalculation,
  loadProfilePolicy,
  toSnapshot,
} from '@/lib/work-preparation/server';

export const runtime = 'nodejs';

type Ctx = {
  params: Promise<{ locale: string; uuid: string }>;
};

export default async function VoorbereidingPage({ params }: Ctx) {
  const { locale, uuid } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/project/${uuid}/voorbereiding`);

  const calc = await loadOwnedCalculation(supabase, uuid, user.id);
  if (!calc) redirect(`/${locale}/dashboard`);

  const [klic, policy, meting] = await Promise.all([
    loadKlicRequest(supabase, uuid, user.id),
    loadProfilePolicy(supabase, user.id),
    supabase
      .from('pendiepte_metingen')
      .select('status')
      .eq('calculation_id', uuid)
      .maybeSingle(),
  ]);

  const policyEnabled = policy.klic_readiness_check_enabled !== false;
  const metingStatus = (meting.data as { status?: string } | null)?.status ?? null;
  const snapshot = toSnapshot(calc, klic, policyEnabled, metingStatus);
  const readiness = buildReadiness(calc, klic, policyEnabled);

  const metingHref =
    metingStatus === 'invited' || metingStatus === 'submitted' || metingStatus === 'confirmed'
      ? `/${locale}/pendiepte-rapport/${uuid}`
      : `/${locale}/tool/diepte?project=${uuid}`;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/dashboard" className="mb-6 inline-block text-xs text-white/40 hover:text-white/70">
          ← Dashboard
        </Link>
        <WorkPreparationPanel
          calculationId={uuid}
          initialSnapshot={snapshot}
          initialReadiness={readiness}
          metingHref={metingHref}
        />
      </div>
    </div>
  );
}
