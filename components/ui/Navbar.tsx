'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export function Navbar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  const navLinks = [
    { href: '/tool/ohm', label: 'Ohm' },
    { href: '/tool/diepte', label: 'Diepte' },
    { href: '/pricing', label: t('pricing') },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#1C1917]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold text-[#E8761A]">
          EarthGND
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                pathname === link.href
                  ? 'text-[#E8761A]'
                  : 'text-[#F5EFE6]/70 hover:text-[#F5EFE6]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-[#F5EFE6]/70 hover:text-[#F5EFE6] transition-colors"
              >
                {t('dashboard')}
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-[#F5EFE6]/70 hover:border-white/40 hover:text-[#F5EFE6] transition-colors"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-[#E8761A] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d06510] transition-colors"
            >
              {t('login')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
