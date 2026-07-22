/**
 * Eén plek die een client-IP afleidt, en één plek die een rate limit
 * toepast. Lost bevinding B6 (bijna geen route had een rate limit) en B7
 * (`x-forwarded-for.split(',')[0]` is een aanname over Vercel's edge-gedrag
 * die nooit apart geverifieerd was) tegelijk op: door dit uit `app/api/bro`
 * te trekken naar één module, is er precies één plek om de openstaande
 * runtime-vraag ("neemt Vercel de eerste of de laatste XFF-entry, en kan de
 * client het overschrijven?") op te lossen zodra dat bevestigd is — in
 * plaats van in elke route opnieuw.
 *
 * `defineEndpoint` (lib/edge/define-endpoint.ts) past dit *altijd* toe,
 * gestuurd door `CapabilityRule.rateLimit` — een route kan dit niet
 * overslaan, want er is geen ander pad naar de handler.
 */

import type { NextRequest } from 'next/server';
import { checkRateLimit as checkRedisRateLimit } from '@/lib/redis';
import type { RateLimitSpec } from './capability';
import type { Principal } from './principal';

/**
 * TODO (openstaande vraag uit het auditrapport, §4.3): bevestig via een
 * curl-test met een zelfgezette X-Forwarded-For-header of Vercel's edge
 * deze header overschrijft of doorlaat. Tot die bevestiging behandelen we
 * de header als potentieel client-beïnvloed en nemen we vanaf het einde
 * (de entry die de proxy het dichtst bij onze server heeft toegevoegd) in
 * plaats van vanaf het begin — dat is de veiligere aanname zolang het
 * platformgedrag niet is bevestigd.
 */
export function getTrustedClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  windowSeconds: number;
}

export async function enforceRateLimit(
  request: NextRequest,
  spec: RateLimitSpec,
  principal: Principal,
  capabilityName: string,
): Promise<RateLimitResult> {
  const key =
    spec.keyedBy === 'principal' && 'id' in principal
      ? `rl:${capabilityName}:principal:${principal.id}`
      : `rl:${capabilityName}:ip:${getTrustedClientIp(request)}`;

  const allowed = await checkRedisRateLimit(key, spec.limit, spec.windowSeconds);
  return { allowed, limit: spec.limit, windowSeconds: spec.windowSeconds };
}
