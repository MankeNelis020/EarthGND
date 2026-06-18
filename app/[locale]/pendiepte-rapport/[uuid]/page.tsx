import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { OpleverrapportView } from '@/components/meting/OpleverrapportView';

type Ctx = { params: Promise<{ uuid: string; locale: string }> };

export async function generateMetadata() {
  return { title: 'Opleverrapport — EarthGND', description: 'Pendiepte opleverrapport met berekende en gemeten waarden' };
}

export default async function PendiepteRapportPage({ params }: Ctx) {
  const { uuid, locale } = await params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/pendiepte-rapport/${uuid}`);

  const [{ data: meting }, { data: calc }] = await Promise.all([
    supabase.from('pendiepte_metingen').select('*').eq('calculation_id', uuid).single(),
    supabase.from('calculations').select('*').eq('id', uuid).single(),
  ]);

  if (!calc) notFound();

  // Only calculator user and monteur can see this
  const isCalculator = calc.user_id === user.id;
  const isMonteur    = meting?.monteur_user_id === user.id || meting?.monteur_email === user.email;

  if (!isCalculator && !isMonteur) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-bold text-[#F5EFE6]">Geen toegang</h1>
          <p className="text-sm text-[#F5EFE6]/60">Dit rapport is niet aan uw account gekoppeld.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <OpleverrapportView
          uuid={uuid}
          calc={calc}
          meting={meting}
          isCalculator={isCalculator}
        />
      </div>
    </div>
  );
}
