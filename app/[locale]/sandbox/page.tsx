import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SandboxDemo } from '@/components/sandbox/SandboxDemo';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ city?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sandbox' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: true, follow: true },
  };
}

export default async function SandboxPage({ searchParams }: Props) {
  const sp = await searchParams;
  return <SandboxDemo initialCityId={sp.city} />;
}
