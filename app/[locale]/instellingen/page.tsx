import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { Link } from '@/i18n/navigation';
import { SettingsForm } from '@/components/settings/SettingsForm';

export const metadata = {
  title: 'Instellingen — EarthGND',
  description: 'Bedrijfsgegevens, installateur en logo voor opleverrapporten.',
};

type Ctx = { params: Promise<{ locale: string }> };

export default async function InstellingenPage({ params }: Ctx) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login?next=/${locale}/instellingen`);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <Link href="/dashboard" className="mb-4 inline-block text-xs text-white/40 hover:text-white/70">
            ← Terug naar dashboard
          </Link>
          <h1 className="font-condensed text-3xl font-black text-white">Instellingen</h1>
          <p className="mt-2 text-sm text-white/50">
            Bedrijfsgegevens voor opleverrapporten. Logo uploaden is beschikbaar vanaf Pro.
          </p>
        </div>
        <SettingsForm />
      </div>
    </div>
  );
}
