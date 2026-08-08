import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Missing keys must not take down authenticated RSC pages (dashboard, etc.).
    onError(error) {
      if (error.code === 'MISSING_MESSAGE' || error.code === 'MISSING_FORMAT') {
        console.warn('[i18n]', error.code, error.message);
        return;
      }
      console.error('[i18n]', error.code, error.message);
    },
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
