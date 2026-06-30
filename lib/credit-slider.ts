/**
 * Losse credits — staffelprijs via schuif (1–100 credits).
 *
 * Ankerpunten (moeten exact kloppen):
 *   1 credit  → €5,95  (€5,95/st)
 *  10 credits → €50,00  (€5,00/st)
 *  50 credits → €99,00  (€1,98/st)
 *
 * Tussen 1–10 en 10–50: lineaire interpolatie op stukprijs.
 * Boven 50: stukprijs blijft €1,98 (zelfde staffel als 50-pack).
 */

import { LOSSE_CREDITS } from './plans';

export const CREDIT_SLIDER_MIN = 1;
export const CREDIT_SLIDER_MAX = 100;

/** Snelle keuze-knoppen op de schuif */
export const CREDIT_SLIDER_PRESETS = [1, 10, 50] as const;

const BASE_UNIT = LOSSE_CREDITS.single.prijs; // €5,95 — enkel referentie + staffelbasis

/** Stukprijs afhankelijk van aantal (staffel). */
export function unitPriceForCredits(credits: number): number {
  const n = clampCredits(credits);

  if (n <= 1) return BASE_UNIT;

  if (n <= LOSSE_CREDITS.bundel.credits) {
    const t = (n - 1) / (LOSSE_CREDITS.bundel.credits - 1);
    const from = BASE_UNIT;
    const to = LOSSE_CREDITS.bundel.prijs / LOSSE_CREDITS.bundel.credits;
    return from + (to - from) * t;
  }

  if (n <= LOSSE_CREDITS.bundel50.credits) {
    const t = (n - LOSSE_CREDITS.bundel.credits) / (LOSSE_CREDITS.bundel50.credits - LOSSE_CREDITS.bundel.credits);
    const from = LOSSE_CREDITS.bundel.prijs / LOSSE_CREDITS.bundel.credits;
    const to = LOSSE_CREDITS.bundel50.prijs / LOSSE_CREDITS.bundel50.credits;
    return from + (to - from) * t;
  }

  return LOSSE_CREDITS.bundel50.prijs / LOSSE_CREDITS.bundel50.credits;
}

/** Totaalbedrag in euro (2 decimalen). */
export function totalPriceForCredits(credits: number): number {
  const n = clampCredits(credits);
  const raw = unitPriceForCredits(n) * n;
  return Math.round(raw * 100) / 100;
}

/** Besparing t.o.v. enkelcredit-prijs (€5,95 × n). */
export function savingsForCredits(credits: number): number {
  const n = clampCredits(credits);
  const list = BASE_UNIT * n;
  const pay = totalPriceForCredits(n);
  return Math.max(0, Math.round((list - pay) * 100) / 100);
}

/** Korting % t.o.v. enkelcredit-prijs. */
export function discountPercentForCredits(credits: number): number {
  const n = clampCredits(credits);
  if (n <= 1) return 0;
  const list = BASE_UNIT * n;
  const pay = totalPriceForCredits(n);
  if (list <= 0) return 0;
  return Math.round(((list - pay) / list) * 100);
}

export function clampCredits(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CREDIT_SLIDER_MIN;
  return Math.min(CREDIT_SLIDER_MAX, Math.max(CREDIT_SLIDER_MIN, n));
}

/** Stripe Checkout: bedrag in centen */
export function totalCentsForCredits(credits: number): number {
  return Math.round(totalPriceForCredits(credits) * 100);
}

export function isValidCreditPurchase(credits: unknown): credits is number {
  return typeof credits === 'number' && Number.isInteger(credits) &&
    credits >= CREDIT_SLIDER_MIN && credits <= CREDIT_SLIDER_MAX;
}
