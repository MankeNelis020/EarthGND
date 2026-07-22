/**
 * Dunne, expliciete transactiecontract-laag rond het bestaande, al-atomaire
 * credit-mechanisme (`lib/pipeline/credit.ts` → `lib/credits.ts` →
 * `supabase/credits_functions.sql`). Vindt geen nieuwe credit-logica uit —
 * hergebruikt `reserveCredit()` (SELECT...FOR UPDATE, bewezen race-vrij in
 * de audit) en formaliseert alleen het buiten-de-pipeline-om herbruikbaar
 * maken ervan, zodat `AuthorizedContext` elke 'consumes-credit'-capability
 * met dezelfde garantie kan bedienen — niet alleen de Diepte-pipeline.
 */

import { reserveCredit } from '@/lib/pipeline/credit';
import type { CreditReservation } from '@/lib/pipeline/types';

export type CreditOutcome =
  | { type: 'not_required' }
  | { type: 'reserved'; reservation: CreditReservation; remaining: number };

export interface CreditDenied {
  type: 'credits_exhausted';
  message: string;
  remaining: number;
}

export async function openCreditTransaction(
  userId: string,
  cost: number,
): Promise<CreditOutcome | CreditDenied> {
  if (cost <= 0) return { type: 'not_required' };
  // Vandaag ondersteunt de onderliggende RPC alleen kosten van 1 credit per
  // aanroep (`deduct_credit` verlaagt met exact 1). Een capability met
  // cost > 1 zou N keer moeten reserveren — niet geïmplementeerd omdat geen
  // enkele gemigreerde capability dit vandaag nodig heeft (vereiste: geen
  // speculatieve abstractie). Expliciete guard i.p.v. stille aanname:
  if (cost !== 1) {
    throw new Error(
      `openCreditTransaction: cost=${cost} wordt niet ondersteund — de onderliggende ` +
      `deduct_credit-RPC verwerkt exact 1 credit per aanroep. Breid lib/credits.ts uit ` +
      `vóór je een capability met een andere kost registreert.`,
    );
  }
  const result = await reserveCredit(userId);
  if (!result.ok) {
    return { type: 'credits_exhausted', message: result.message, remaining: result.remaining };
  }
  return { type: 'reserved', reservation: result.reservation, remaining: result.remaining };
}
