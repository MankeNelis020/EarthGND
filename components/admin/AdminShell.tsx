'use client';

import { Link, usePathname } from '@/i18n/navigation';
import {
  ADMIN_NAV,
  adminHrefIsActive,
  resolveActiveAdminId,
} from '@/lib/admin/nav';

export function AdminShell({
  children,
  width = 'default',
}: {
  children: React.ReactNode;
  /** default = max-w-4xl, wide = max-w-6xl, full = max-w-7xl */
  width?: 'default' | 'wide' | 'full';
}) {
  const pathname = usePathname();
  const activeId = resolveActiveAdminId(pathname);

  const maxW =
    width === 'wide' ? 'max-w-6xl' : width === 'full' ? 'max-w-7xl' : 'max-w-4xl';

  return (
    <div className="min-h-screen bg-[#1C1917] text-white print:bg-white print:text-black">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#1C1917]/95 backdrop-blur-md print:hidden">
        <div className={`mx-auto flex ${maxW} flex-col gap-3 px-4 py-3 sm:px-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="group flex items-baseline gap-2">
              <span className="font-condensed text-lg font-black tracking-tight text-white group-hover:text-[#E8761A]">
                EarthGND
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Admin
              </span>
            </Link>
          </div>

          <nav aria-label="Admin" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
            {ADMIN_NAV.map(group => (
              <div key={group.id} className="min-w-0">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  {group.label}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {group.items.map(item => {
                    const active = adminHrefIsActive(pathname, item) || activeId === item.id;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={[
                            'inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                            active
                              ? 'bg-[#E8761A]/15 text-[#E8761A] ring-1 ring-[#E8761A]/40'
                              : 'text-white/55 hover:bg-white/5 hover:text-white',
                          ].join(' ')}
                          aria-current={active ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </header>

      <div className={`mx-auto ${maxW} px-4 py-8 sm:px-6 print:max-w-none print:px-6 print:py-4`}>
        {children}
      </div>
    </div>
  );
}

/** Compact page title block used under the shared nav. */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 print:mb-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8761A]/90 print:text-black/50">
            {eyebrow}
          </p>
        )}
        <h1 className="font-condensed mt-1 text-3xl font-black tracking-tight print:text-black sm:text-4xl">
          {title}
        </h1>
        {description && (
          <div className="mt-2 max-w-2xl text-sm text-white/50 print:text-black/60">{description}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
    </div>
  );
}
