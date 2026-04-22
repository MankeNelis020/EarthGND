'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Link } from '@/i18n/navigation';

export default function LoginPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `https://earthgnd.com/auth/callback`,
      },
    });

    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-4 text-5xl">📬</div>
          <h1 className="mb-2 text-2xl font-bold text-[#F5EFE6]">{t('successTitle')}</h1>
          <p className="mb-8 text-[#F5EFE6]/60">
            {t('successDesc', { email })}
          </p>
          <Link
            href="/"
            className="text-sm text-[#E8761A] underline underline-offset-2 hover:text-[#d06510]"
          >
            {t('backToHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 text-4xl font-black text-[#E8761A]">EarthGND</div>
          <h1 className="text-2xl font-bold text-[#F5EFE6]">{t('title')}</h1>
          <p className="mt-2 text-sm text-[#F5EFE6]/60">{t('subtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/10 bg-white/5 p-6"
        >
          <div className="flex flex-col gap-4">
            <Input
              label={t('email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
              required
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              {loading ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
