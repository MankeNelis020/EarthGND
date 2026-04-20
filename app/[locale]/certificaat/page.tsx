import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';

export default async function CertificaatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-4 text-3xl font-black text-[#F5EFE6]">Certificaten</h1>
      <p className="mb-8 text-[#F5EFE6]/60">
        Uw gegenereerde certificaten en rapporten zijn beschikbaar via het dashboard.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-[#E8761A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
      >
        Naar Dashboard
      </Link>
    </div>
  );
}
