import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface PlanConfig {
  key: 'starter' | 'pro' | 'enterprise';
  popular: boolean;
}

const PLANS: PlanConfig[] = [
  { key: 'starter', popular: false },
  { key: 'pro', popular: true },
  { key: 'enterprise', popular: false },
];

export default function PricingPage() {
  const t = useTranslations('pricing');

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-black text-[#F5EFE6]">{t('title')}</h1>
        <p className="mt-3 text-[#F5EFE6]/60">{t('subtitle')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map(({ key, popular }) => {
          const name = t(`${key}.name`);
          const price = t(`${key}.price`);
          const desc = t(`${key}.desc`);
          const features = t.raw(`${key}.features`) as string[];
          const isEnterprise = key === 'enterprise';

          return (
            <div
              key={key}
              className={`relative rounded-xl border p-8 transition-all ${
                popular
                  ? 'border-[#E8761A] bg-[#E8761A]/5 shadow-lg shadow-[#E8761A]/10'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              {popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#E8761A] px-3 py-1 text-xs font-semibold text-white">
                    {t('popular')}
                  </span>
                </div>
              )}

              <h2 className="mb-1 text-xl font-bold text-[#F5EFE6]">{name}</h2>
              <p className="mb-4 text-sm text-[#F5EFE6]/50">{desc}</p>

              <div className="mb-6">
                {isEnterprise ? (
                  <span className="text-2xl font-bold text-[#E8761A]">{price}</span>
                ) : (
                  <>
                    <span className="text-4xl font-black text-[#E8761A]">€{price}</span>
                    <span className="text-[#F5EFE6]/40">/mo</span>
                  </>
                )}
              </div>

              <ul className="mb-8 flex flex-col gap-2">
                {features.map((feature: string) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-[#F5EFE6]/70">
                    <span className="text-[#E8761A]">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              {isEnterprise ? (
                <a
                  href="mailto:info@earthgnd.nl"
                  className="block w-full rounded-lg border border-[#E8761A] px-4 py-3 text-center text-sm font-semibold text-[#E8761A] transition-colors hover:bg-[#E8761A]/10"
                >
                  {t('contactUs')}
                </a>
              ) : (
                <Link
                  href="/login"
                  className={`block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition-colors ${
                    popular
                      ? 'bg-[#E8761A] text-white hover:bg-[#d06510]'
                      : 'border border-white/20 text-[#F5EFE6] hover:border-white/40'
                  }`}
                >
                  {t('cta')}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
