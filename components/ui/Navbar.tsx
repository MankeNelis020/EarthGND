'use client';

import { useEffect, useState } from 'react';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/utils/supabase/client';
import { routing, localeLabels } from '@/i18n/routing';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface Profile {
  plan: string;
  credits_left: number;
}

export function Navbar() {
  const locale  = useLocale();
  const pathname = usePathname();
  const router  = useRouter();
  const t       = useTranslations('nav');

  const [user,         setUser]        = useState<User | null>(null);
  const [profile,      setProfile]     = useState<Profile | null>(null);
  const [menuOpen,     setMenuOpen]    = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user);
      if (data.user) fetchProfile(data.user.id, supabase);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, supabase);
      else setProfile(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase
      .from('profiles')
      .select('plan, credits_left')
      .eq('id', userId)
      .single();
    if (data) setProfile(data as Profile);
  }

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await createClient().auth.signOut();
    router.push('/');
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-0">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-0 py-4 select-none">
          <span className="font-condensed text-xl font-bold tracking-tight text-white">Earth</span>
          <span className="font-condensed text-xl font-bold tracking-tight text-brand">GND</span>
          <span className="ml-1.5 mt-0.5 text-[11px] font-medium text-brand/55">Aarding</span>
        </Link>

        {/* Centre nav */}
        <div className="hidden items-center gap-1 md:flex">
          <NavLink href="/tool/ohm"   label={t('weerstand')} active={isActive('/tool/ohm')} />
          <NavLink href="/tool/diepte" label={t('pendiepte')} active={isActive('/tool/diepte')} locked={!user} />
          <NavLink href="/pricing"    label={t('pricing')}   active={isActive('/pricing')} />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">

          {/* Language switcher — driven by routing.locales, no code change needed for new languages */}
          <div className="hidden items-center gap-0.5 md:flex">
            {routing.locales.map((loc, i) => (
              <span key={loc} className="flex items-center">
                {i > 0 && <span className="text-white/30 text-xs">/</span>}
                <button
                  onClick={() => switchLocale(loc)}
                  className={`px-1.5 py-1 text-xs font-semibold transition-colors ${
                    locale === loc ? 'text-[#E8761A]' : 'text-white/60 hover:text-white/70'
                  }`}
                >
                  {localeLabels[loc] ?? loc.toUpperCase()}
                </button>
              </span>
            ))}
          </div>

          {user ? (
            <>
              {profile && (
                <Link
                  href="/dashboard"
                  className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:border-white/20 transition-colors md:flex"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E8761A]" />
                  {profile.credits_left} credits
                </Link>
              )}
              <Link
                href="/dashboard"
                className="hidden text-sm text-white/60 hover:text-white transition-colors md:block"
              >
                {t('dashboard')}
              </Link>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="hidden rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/60 hover:border-white/30 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed md:block"
              >
                {isLoggingOut ? '…' : t('logout')}
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

          {/* Mobile menu toggle */}
          <button
            className="rounded-lg border border-white/10 p-2 text-white/60 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            <div className="flex flex-col gap-1">
              <span className={`block h-0.5 w-4 bg-current transition-transform ${menuOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
              <span className={`block h-0.5 w-4 bg-current transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-4 bg-current transition-transform ${menuOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-white/8 bg-[#111] px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            <MobileLink href="/tool/ohm"    label={t('weerstand') + ' Calculator'} onClick={() => setMenuOpen(false)} />
            <MobileLink href="/tool/diepte" label={t('pendiepte') + ' Calculator' + (!user ? ` (${t('login').toLowerCase()} vereist)` : '')} onClick={() => setMenuOpen(false)} />
            <MobileLink href="/pricing"     label={t('pricing')}                   onClick={() => setMenuOpen(false)} />
            {user  && <MobileLink href="/dashboard" label={t('dashboard')} onClick={() => setMenuOpen(false)} />}
            {!user && <MobileLink href="/login"     label={t('login')}     onClick={() => setMenuOpen(false)} />}
            {user && (
              <button
                onClick={() => { handleLogout(); setMenuOpen(false); }}
                className="mt-2 w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60"
              >
                {t('logout')}
              </button>
            )}
            {/* Mobile language switcher */}
            <div className="mt-3 flex items-center gap-1 border-t border-white/8 pt-3">
              {routing.locales.map((loc, i) => (
                <span key={loc} className="flex items-center">
                  {i > 0 && <span className="text-white/30 text-xs px-1">/</span>}
                  <button
                    onClick={() => { switchLocale(loc); setMenuOpen(false); }}
                    className={`text-xs font-semibold transition-colors ${
                      locale === loc ? 'text-[#E8761A]' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {localeLabels[loc] ?? loc.toUpperCase()}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, label, active, locked }: { href: string; label: string; active: boolean; locked?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-white/8 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
      }`}
    >
      {label}
      {locked && (
        <svg className="h-3 w-3 text-white/70" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 10h-1V7A5 5 0 0 0 7 7v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-7H9V7a3 3 0 0 1 6 0v3z"/>
        </svg>
      )}
    </Link>
  );
}

function MobileLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}
