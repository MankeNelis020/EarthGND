import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['nl', 'en', 'de'],
  defaultLocale: 'nl',
});

// Display labels for the locale switcher.
// To add a new language: 1) add to locales above, 2) add label here, 3) create messages/{locale}.json
export const localeLabels: Record<string, string> = {
  nl: 'NL',
  en: 'EN',
  de: 'DE',
};
