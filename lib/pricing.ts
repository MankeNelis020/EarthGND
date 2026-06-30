/**
 * Central price formatting — numeric amounts live in lib/plans.ts only.
 * Stripe Dashboard prices must match those values (see docs/stripe-pricing.md).
 */

type LocaleCode = 'nl' | 'en' | 'de' | string;

function intlLocale(locale: LocaleCode): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'en') return 'en-GB';
  return 'nl-NL';
}

/** Full currency string, e.g. "€ 39,00" (nl) or "€39.00" (en). */
export function formatPrice(amount: number, locale: LocaleCode = 'nl'): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact € prefix for inline UI, e.g. €39 or €2,95 */
export function formatPriceCompact(amount: number, locale: LocaleCode = 'nl'): string {
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `€${formatted}`;
}

export function unitPricePerCredit(prijs: number, credits: number, locale: LocaleCode = 'nl'): string {
  if (credits <= 0) return '—';
  return formatPriceCompact(prijs / credits, locale);
}

export function monthlyLabel(locale: LocaleCode = 'nl'): string {
  if (locale === 'de') return '/Monat';
  if (locale === 'en') return '/mo';
  return '/mnd';
}
