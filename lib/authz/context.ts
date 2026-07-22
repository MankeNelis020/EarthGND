/**
 * De authorization-kernel. Dit bestand is de enige plek in de codebase die
 * een `AuthorizedContext<C>` kan construeren — de constructor is private.
 * Er bestaat geen `as any`-vrije manier om businesslogica aan te roepen
 * zonder door `authorize()` te zijn gegaan: elke use-case in
 * `lib/application/**` vraagt om een `AuthorizedContext<'exact-capability'>`
 * als eerste parameter, en de enige plek die zo'n waarde kan produceren is
 * hier.
 *
 * Credit-afhandeling (capture/release) is met opzet GEEN methode op de
 * publieke klasse — dat zou een use-case in staat stellen zelf te
 * capturen/releasen en dus een foutpad te vergeten (precies het patroon
 * waar vereiste #6 tegen waarschuwt). In plaats daarvan staat de
 * credit-reservering in een module-lokale WeakMap, en zijn
 * `settleCapture()`/`settleRelease()` de enige toegang daartoe — geïmporteerd
 * door, en uitsluitend aangeroepen vanuit, `lib/edge/define-endpoint.ts`.
 */

import type { NextRequest } from 'next/server';
import { type Capability, ruleFor } from './capability';
import { hasActivePlanAccess, type Principal, type PrincipalKind } from './principal';
import {
  resolveAnonymousPrincipal,
  resolveAdminPrincipal,
  resolveCronPrincipal,
  resolveServicePrincipal,
  resolveUserPrincipal,
} from './resolvers';
import { openCreditTransaction, type CreditOutcome } from '@/lib/domain/credit-ledger';
import { enforceRateLimit } from './rate-limit';

// ─── Denial ────────────────────────────────────────────────────────────────────

export class AuthorizationDenied {
  private constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {}

  static unauthenticated() {
    return new AuthorizationDenied(401, { error: 'Niet ingelogd' });
  }
  static forbidden(reason = 'Geen toegang') {
    return new AuthorizationDenied(403, { error: reason });
  }
  static upgradeRequired() {
    return new AuthorizationDenied(402, { error: 'Dit vereist een actief plan of credits.' });
  }
  static creditsExhausted(remaining: number, message: string) {
    return new AuthorizationDenied(402, { error: message, creditsRemaining: remaining });
  }
  static rateLimited(limit: number, windowSeconds: number) {
    return new AuthorizationDenied(429, { error: 'Te veel verzoeken — probeer het later opnieuw.', limit, windowSeconds });
  }
  static misconfigured(detail: string) {
    return new AuthorizationDenied(500, { error: 'Serverconfiguratiefout', detail });
  }

  toResponse(): Response {
    return Response.json(this.body, { status: this.status });
  }
}

// ─── AuthorizedContext ─────────────────────────────────────────────────────────

declare const brand: unique symbol;

interface CreditState {
  outcome: CreditOutcome;
}

const CREDIT_STATE = new WeakMap<AuthorizedContext<Capability>, CreditState>();

export class AuthorizedContext<C extends Capability> {
  /** Puur voor het typesysteem — bestaat niet at runtime, voorkomt structurele verwarring tussen contexten van verschillende capabilities. */
  private readonly [brand]!: C;

  private constructor(
    public readonly principal: Principal,
    public readonly capability: C,
  ) {}

  /**
   * Enige constructor. Loopt principal-resolutie, entitlement, ownership,
   * rate limit en credit-reservering af, in die volgorde — een
   * AuthorizedContext kan domweg niet bestaan als één van die stappen
   * faalt.
   */
  static async authorize<C extends Capability>(params: {
    request: NextRequest;
    capability: C;
    /**
     * Server-side vastgestelde eigenaar van de resource, of `null` als de
     * resource niet bestaat / geen eigenaar heeft. MOET het resultaat zijn
     * van een database-lookup (lib/domain/**-repository) — nooit een waarde
     * uit de request-body. Alleen vereist wanneer de capability-regel
     * `requiresOwnership: true` heeft; defineEndpoint dwingt dat af op
     * type-niveau (zie lib/edge/define-endpoint.ts).
     */
    resolvedOwnerId?: string | null;
    /** Voor 'webhook'-capabilities: de raw body, nodig voor signature-verificatie. */
    rawBodyForWebhook?: string;
    callerNameForService?: string;
  }): Promise<AuthorizedContext<C> | AuthorizationDenied> {
    const rule = ruleFor(params.capability);

    // ── 1. Principal resolveren — probeer elke toegestane soort ────────────
    let principal: Principal | null = null;
    for (const kind of rule.allowedPrincipals as readonly PrincipalKind[]) {
      principal = await AuthorizedContext.tryResolve(kind, params);
      if (principal) break;
    }
    if (!principal) return AuthorizationDenied.unauthenticated();

    // ── 2. Entitlement (plan/credits) — vóór rate limit/credit-reservering ─
    if (rule.entitlement.type === 'requires-active-plan') {
      if (principal.kind !== 'user') return AuthorizationDenied.forbidden();
      const creditsLeft = await (await import('./resolvers')).loadCreditsLeft(principal.id);
      if (!hasActivePlanAccess(principal.plan, creditsLeft)) return AuthorizationDenied.upgradeRequired();
    }

    // ── 3. Ownership — server-side vastgesteld, nooit client-input ─────────
    if (rule.requiresOwnership) {
      if (!('id' in principal)) return AuthorizationDenied.forbidden();
      if (params.resolvedOwnerId == null || params.resolvedOwnerId !== principal.id) {
        // Bewust dezelfde respons voor "bestaat niet" en "is niet van jou" —
        // voorkomt dat een aanvaller kan onderscheiden of een resource-ID
        // van iemand anders bestaat (resource-ID-enumeratie).
        return AuthorizationDenied.forbidden('Niet gevonden of geen toegang');
      }
    }

    // ── 4. Rate limit ───────────────────────────────────────────────────────
    const rl = await enforceRateLimit(params.request, rule.rateLimit, principal, params.capability);
    if (!rl.allowed) return AuthorizationDenied.rateLimited(rl.limit, rl.windowSeconds);

    // ── 5. Credit-reservering ────────────────────────────────────────────────
    let creditOutcome: CreditOutcome = { type: 'not_required' };
    if (rule.entitlement.type === 'consumes-credit') {
      if (principal.kind !== 'user') return AuthorizationDenied.forbidden();
      const result = await openCreditTransaction(principal.id, rule.entitlement.cost);
      if (result.type === 'credits_exhausted') {
        return AuthorizationDenied.creditsExhausted(result.remaining, result.message);
      }
      creditOutcome = result;
    }

    const ctx = new AuthorizedContext(principal, params.capability);
    CREDIT_STATE.set(ctx as AuthorizedContext<Capability>, { outcome: creditOutcome });
    return ctx;
  }

  private static async tryResolve(
    kind: PrincipalKind,
    params: {
      request: NextRequest;
      resolvedOwnerId?: string | null;
      rawBodyForWebhook?: string;
      callerNameForService?: string;
    },
  ): Promise<Principal | null> {
    switch (kind) {
      case 'anonymous':
        return resolveAnonymousPrincipal();
      case 'user':
        return resolveUserPrincipal();
      case 'admin':
        return resolveAdminPrincipal();
      case 'cron':
        return resolveCronPrincipal(params.request);
      case 'service':
        return resolveServicePrincipal(params.request, params.callerNameForService ?? 'unknown');
      case 'webhook':
        // Webhook-principals hebben een aparte, bron-specifieke resolver
        // (Stripe vs. Slack hebben andere signature-schema's) — die worden
        // rechtstreeks door de route aangeroepen vóórdat authorize() met
        // een reeds-geresolveerd principal wordt aangevuld. Zie
        // lib/edge/define-endpoint.ts voor de webhook-tak.
        return null;
    }
  }
}

// ─── Credit-settlement — uitsluitend voor lib/edge/define-endpoint.ts ──────────

/** @internal alleen aanroepen vanuit defineEndpoint, na succesvolle handler-executie. */
export async function settleCapture(ctx: AuthorizedContext<Capability>): Promise<void> {
  const state = CREDIT_STATE.get(ctx);
  if (state?.outcome.type === 'reserved') await state.outcome.reservation.capture();
}

/** @internal alleen aanroepen vanuit defineEndpoint, wanneer de handler een fout gooit. */
export async function settleRelease(ctx: AuthorizedContext<Capability>): Promise<void> {
  const outcome = CREDIT_STATE.get(ctx)?.outcome;
  if (outcome?.type === 'reserved') {
    const { reservation } = outcome;
    await reservation.release().catch(() => {
      // Best-effort: als release faalt, loggen we — een dubbele fout mag de
      // oorspronkelijke foutrespons niet verbergen.
      console.error(`[authz] credit-release mislukt voor reservation ${reservation.id}`);
    });
  }
}

export function creditsRemainingFor(ctx: AuthorizedContext<Capability>): number | null {
  const state = CREDIT_STATE.get(ctx);
  return state?.outcome.type === 'reserved' ? state.outcome.remaining : null;
}
