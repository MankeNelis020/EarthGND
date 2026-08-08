/**
 * Working-day helpers for KLIC deadline warnings.
 * Limitation: weekdays only — NL public holidays are not modeled yet.
 */

export const KLIC_WARNING_THRESHOLDS = {
  reminderWorkdays: 10,
  warningWorkdays: 5,
  urgentWorkdays: 3,
} as const;

function parseDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toDateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isWeekendUtc(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Working days from `from` (date-only UTC) until planned execution.
 * Same calendar day → 0. Past dates → negative weekday count.
 */
export function calculateWorkingDaysUntil(
  plannedExecutionDate: string,
  from: Date = new Date(),
): number {
  const target = parseDateOnly(plannedExecutionDate);
  const start = toDateOnlyUtc(from);

  if (target.getTime() === start.getTime()) return 0;

  const forward = target.getTime() > start.getTime();
  const earlier = forward ? start : target;
  const later = forward ? target : start;

  let workdays = 0;
  const cursor = new Date(earlier);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= later.getTime()) {
    if (!isWeekendUtc(cursor)) workdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return forward ? workdays : -workdays;
}

export function hasExecutionDateChangedSinceKlic(
  plannedExecutionDate: string | null | undefined,
  executionDateAtSubmission: string | null | undefined,
): boolean {
  if (!plannedExecutionDate || !executionDateAtSubmission) return false;
  return plannedExecutionDate !== executionDateAtSubmission;
}
