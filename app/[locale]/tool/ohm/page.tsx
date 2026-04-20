import { useTranslations } from 'next-intl';
import { OhmCalculator } from '@/components/tools/OhmCalculator';

export default function OhmPage() {
  const t = useTranslations('ohm');
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-[#F5EFE6]">{t('title')}</h1>
        <p className="mt-2 text-[#F5EFE6]/60">{t('subtitle')}</p>
      </div>
      <OhmCalculator />
    </div>
  );
}
