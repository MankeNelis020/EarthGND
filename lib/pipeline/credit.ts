/**
 * Credit reserve / capture / release.
 *
 * Pattern:
 *   1. reserveCredit()  → atomically deducts 1 credit, returns a reservation handle
 *   2. reservation.capture() → no-op (already deducted); marks captured for idempotency
 *   3. reservation.release() → refunds 1 credit via addCredits(); marks released
 *
 * Atomicity: the actual debit is in the DB-level RPC (deduct_credit / add_credits),
 * which runs in a transaction. The reservation object prevents double-release within
 * a single request via the `released` flag.
 *
 * Note: across requests, idempotency relies on the caller not calling release twice.
 * A full credit_reservations DB table (for cross-request idempotency) is
 * a future improvement aligned with Doc 2 storage work.
 */

import { randomUUID } from 'crypto';
import { deductCredit, addCredits } from '@/lib/credits';
import type { CreditReservation } from './types';

export type ReserveResult =
  | { ok: true;  reservation: CreditReservation; remaining: number }
  | { ok: false; message: string; remaining: number };

export async function reserveCredit(userId: string): Promise<ReserveResult> {
  const { ok, remaining } = await deductCredit(userId);

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
      captured = true; // no-op on DB; credit already deducted in reserve
    },

    async release() {
      if (captured) throw new Error(`Reservation ${id} already captured; cannot release.`);
      if (released) return; // idempotent: releasing twice is safe
      released = true;
      await addCredits(userId, 1, `credit-released:${id} — berekening niet geslaagd`);
    },
  };

  return { ok: true, reservation, remaining };
}
