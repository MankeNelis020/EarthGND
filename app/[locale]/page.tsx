import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="mb-3 text-3xl">{icon}</div>
      <h3 className="mb-2 font-semibold text-[#F5EFE6]">{title}</h3>
      <p className="text-sm leading-relaxed text-[#F5EFE6]/60">{desc}</p>
    </div>
  );
}

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      {/* Hero */}
      <div className="mb-20 text-center">
        <div className="mb-4 inline-block rounded-full border border-[#E8761A]/30 bg-[#E8761A]/10 px-4 py-1.5 text-sm text-[#E8761A]">
          MVP v1.0
        </div>
        <h1 className="mb-6 text-4xl font-black leading-tight text-[#F5EFE6] md:text-6xl">
          {t('title')}
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-[#F5EFE6]/60">
          {t('subtitle')}
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/tool/ohm"
            className="rounded-lg bg-[#E8761A] px-8 py-3.5 font-semibold text-white transition-colors hover:bg-[#d06510]"
          >
            {t('ctaPrimary')}
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-white/20 px-8 py-3.5 font-semibold text-[#F5EFE6]/80 transition-colors hover:border-white/40 hover:text-[#F5EFE6]"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="grid gap-6 md:grid-cols-3">
        <FeatureCard icon="⚡" title={t('featureCalc')} desc={t('featureCalcDesc')} />
        <FeatureCard icon="🌍" title={t('featureBro')} desc={t('featureBroDesc')} />
        <FeatureCard icon="📄" title={t('featurePdf')} desc={t('featurePdfDesc')} />
      </div>

      {/* Tool cards */}
      <div className="mt-20 grid gap-6 md:grid-cols-2">
        <Link href="/tool/ohm" className="group rounded-xl border border-white/10 bg-white/5 p-8 transition-colors hover:border-[#E8761A]/40 hover:bg-[#E8761A]/5">
          <div className="mb-3 text-4xl">🔌</div>
          <h2 className="mb-2 text-xl font-bold text-[#F5EFE6] group-hover:text-[#E8761A]">Ohm Calculator</h2>
          <p className="text-sm text-[#F5EFE6]/60">Maximale aardingsweerstand berekenen op basis van spanning en lekstroom.</p>
        </Link>
        <Link href="/tool/diepte" className="group rounded-xl border border-white/10 bg-white/5 p-8 transition-colors hover:border-[#E8761A]/40 hover:bg-[#E8761A]/5">
          <div className="mb-3 text-4xl">📏</div>
          <h2 className="mb-2 text-xl font-bold text-[#F5EFE6] group-hover:text-[#E8761A]">Diepte Calculator</h2>
          <p className="text-sm text-[#F5EFE6]/60">Benodigde indraaidiepte berekenen via de formule van Dwight.</p>
        </Link>
      </div>
    </div>
  );
}
