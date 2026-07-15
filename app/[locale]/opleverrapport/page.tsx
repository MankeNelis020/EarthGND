import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { Link } from '@/i18n/navigation';
import { MetingKoppelenPanel } from '@/components/meting/MetingKoppelenPanel';

export const metadata = {
  title: 'Opleverrapport kiezen — EarthGND',
  description: 'Kies een veldmeting of koppel via UUID.',
};

type Ctx = { params: Promise<{ locale: string }> };

export default async function OpleverrapportHubPage({ params }: Ctx) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/opleverrapport`);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-lg px-4 py-10">
        <Link href="/dashboard" className="mb-6 inline-block text-xs text-white/40 hover:text-white/70">
          ← Terug naar dashboard
        </Link>
        <h1 className="font-condensed mb-2 text-3xl font-black text-white">Opleverrapport</h1>
        <p className="mb-8 text-sm text-white/50">
          Pendiepte opleverrapporten combineren berekening en veldmeting. Kies welke meting u wilt openen.
        </p>
        <MetingKoppelenPanel locale={locale} />
      </div>
    </div>
  );
}
