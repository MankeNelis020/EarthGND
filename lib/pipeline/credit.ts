/**
 * Credit reserve / capture / release.
 *
 * Pattern:
 *   1. reserveCredit()  → atomically deducts 1 credit, returns a reservation handle
 *   2. reservation.capture() → no-op (already deducted); marks captured for idempotency
 *   3. reservation.release() → refunds 1 credit to the same pool (subscription vs purchased)
 *
 * Deduction order: subscription credits first, then purchased credits.
 */

import { randomUUID } from 'crypto';
import { deductCredit, releaseCredit } from '@/lib/credits';
import type { CreditReservation } from './types';

export type ReserveResult =
  | { ok: true;  reservation: CreditReservation; remaining: number }
  | { ok: false; message: string; remaining: number };

export async function reserveCredit(userId: string): Promise<ReserveResult> {
  const { ok, remaining, fromPurchased } = await deductCredit(userId);

  if (!ok) {
    return {
      ok: false,
      message: 'Onvoldoende credits — koop credits bij of upgrade je abonnement.',
      remaining: 0,
    };
  }

  const id = randomUUID();
  let captured = false;
  let released = false;

  const reservation: CreditReservation = {
    id,
    get captured() { return captured; },
    get released() { return released; },

    async capture() {
      if (released) throw new Error(`Reservation ${id} already released; cannot capture.`);
      captured = true;
    },

    async release() {
      if (captured) throw new Error(`Reservation ${id} already captured; cannot release.`);
      if (released) return;
      released = true;
      await releaseCredit(
        userId,
        fromPurchased,
        `credit-released:${id} — berekening niet geslaagd`,
      );
    },
  };

  return { ok: true, reservation, remaining };
}
