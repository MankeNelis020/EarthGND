/**
 * De enige toegestane manier om een route-handler te schrijven onder
 * `app/api/**`. Een `route.ts`-bestand dat geen `defineEndpoint(...)`
 * gebruikt, is precies het gat dat CI blokkeert
 * (scripts/architecture/check-route-manifest.ts) — er is dus geen
 * praktisch alternatief pad meer om een endpoint te bouwen.
 *
 * Wat dit structureel afdwingt (niet als conventie, maar als compileerbare
 * eis):
 *  - `capability` moet een bestaande entry in CAPABILITY_REGISTRY zijn
 *    (vereiste #2: principal/entitlement/rate-limit/audit/idempotency
 *    liggen daar al vast, gedeclareerd, niet in de route zelf verspreid).
 *  - `resourceOwner` is verplicht zodra de capability `requiresOwnership`
 *    heeft — TypeScript weigert te compileren zonder (vereiste #4: nooit
 *    een client-aangeleverd owner-ID vertrouwen).
 *  - `handler` ontvangt een `AuthorizedContext<C>` — een waarde die alleen
 *    `AuthorizedContext.authorize()` kan produceren.
 *  - credit-capture/release gebeurt hier, rond de hele handler-executie —
 *    de handler zelf kan dit niet beïnvloeden (vereiste #6).
 */

import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { AuthorizedContext, AuthorizationDenied, settleCapture, settleRelease } from '@/lib/authz/context';
import { CAPABILITY_REGISTRY, type Capability } from '@/lib/authz/capability';
import { UseCaseRejection, jsonError } from './responses';

type RequiresOwnership<C extends Capability> = (typeof CAPABILITY_REGISTRY)[C]['requiresOwnership'];

type ResourceOwnerField<C extends Capability, TInput> = RequiresOwnership<C> extends true
  ? { resourceOwner: (input: TInput) => Promise<string | null> }
  : { resourceOwner?: undefined };

type BaseConfig<C extends Capability, TInput> = {
  capability: C;
  /** Waar de ruwe input vandaan komt — query-string (GET) of JSON-body (overig). */
  source: 'query' | 'json';
  input: z.ZodType<TInput>;
  handler: (ctx: AuthorizedContext<C>, input: TInput) => Promise<Response>;
};

export type EndpointConfig<C extends Capability, TInput> = BaseConfig<C, TInput> & ResourceOwnerField<C, TInput>;

async function extractRawInput(
  request: NextRequest,
  routeParams: Record<string, string>,
  source: 'query' | 'json',
): Promise<unknown> {
  if (source === 'query') {
    const merged: Record<string, string> = { ...routeParams };
    request.nextUrl.searchParams.forEach((value, key) => { merged[key] = value; });
    return merged;
  }
  const body = await request.json().catch(() => null);
  return { ...routeParams, ...(body && typeof body === 'object' ? body : {}) };
}

export function defineEndpoint<C extends Capability, TInput>(
  config: EndpointConfig<C, TInput>,
) {
  return async (request: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const routeParams = routeCtx ? await routeCtx.params : {};

    const raw = await extractRawInput(request, routeParams, config.source);
    const parsed = config.input.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, 'Ongeldige invoer', { details: parsed.error.flatten() });
    }
    const input = parsed.data;

    let resolvedOwnerId: string | null | undefined;
    if ('resourceOwner' in config && config.resourceOwner) {
      resolvedOwnerId = await config.resourceOwner(input);
    }

    const authResult = await AuthorizedContext.authorize({
      request,
      capability: config.capability,
      resolvedOwnerId,
    });

    if (authResult instanceof AuthorizationDenied) {
      return authResult.toResponse();
    }

    const ctx = authResult;
    try {
      const response = await config.handler(ctx, input);
      await settleCapture(ctx as AuthorizedContext<Capability>);
      return response;
    } catch (err) {
      await settleRelease(ctx as AuthorizedContext<Capability>);
      if (err instanceof UseCaseRejection) return err.response;
      console.error(`[${config.capability}] onverwachte fout:`, err);
      return jsonError(500, 'Er is een onverwachte fout opgetreden.');
    }
  };
}
