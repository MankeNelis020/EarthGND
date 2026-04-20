import { useTranslations } from 'next-intl';
import { DiepteCalculator } from '@/components/tools/DiepteCalculator';

export default function DieptePage() {
  const t = useTranslations('diepte');
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-[#F5EFE6]">{t('title')}</h1>
        <p className="mt-2 text-[#F5EFE6]/60">{t('subtitle')}</p>
      </div>
      <DiepteCalculator />
    </div>
  );
}
