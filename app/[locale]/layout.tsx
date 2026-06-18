import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Navbar } from '@/components/ui/Navbar';
import { Footer } from '@/components/ui/Footer';
import { Providers } from '@/components/Providers';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `https://earthgnd.com/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map(loc => [loc, `https://earthgnd.com/${loc}`])
      ),
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      locale,
      type: 'website',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-[#1C1917] text-[#F5EFE6] antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Navbar />
            <main>{children}</main>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
