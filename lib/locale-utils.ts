/** Maps a next-intl locale code to an Intl locale identifier. */
export function toIntlLocale(locale: string): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'en') return 'en-GB';
  return 'nl-NL';
}
