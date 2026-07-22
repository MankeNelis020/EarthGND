/**
 * Algemeen principal-model (vereiste #5).
 *
 * Elke aanroeper van de applicatielaag — mens of machine — is een Principal.
 * Dit vervangt het impliciete onderscheid dat vroeger per route opnieuw werd
 * uitgevonden: sommige routes controleerden `auth.getUser()`, andere een
 * `x-import-key`-header, andere een Slack-HMAC, andere niets. Door één
 * gesloten union te maken, kan `AuthorizedContext` (context.ts) generiek
 * over "wie roept dit aan" redeneren, en kan de capability-registry per
 * capability declareren welke principal-soorten zijn toegestaan.
 */

export type Tier = 'gratis' | 'starter' | 'basic' | 'pro';

export interface AnonymousPrincipal {
  kind: 'anonymous';
}

export interface UserPrincipal {
  kind: 'user';
  id: string;
  email: string;
  plan: Tier;
}

export interface AdminPrincipal {
  kind: 'admin';
  id: string;
  email: string;
}

export interface WebhookPrincipal {
  kind: 'webhook';
  /** Welke externe partij dit request cryptografisch heeft ondertekend. */
  source: 'stripe' | 'slack';
}

export interface CronPrincipal {
  kind: 'cron';
}

export interface ServicePrincipal {
  kind: 'service';
  /** Naam van de aanroepende interne route/module, voor audit-logging. */
  caller: string;
}

export type Principal =
  | AnonymousPrincipal
  | UserPrincipal
  | AdminPrincipal
  | WebhookPrincipal
  | CronPrincipal
  | ServicePrincipal;

export type PrincipalKind = Principal['kind'];

export function isUser(p: Principal): p is UserPrincipal {
  return p.kind === 'user';
}

export function isAdmin(p: Principal): p is AdminPrincipal {
  return p.kind === 'admin';
}

/**
 * De 'requires-active-plan'-toegangsregel als pure, herbruikbare functie.
 * Was vóór deze migratie alleen inline aanwezig in
 * `app/[locale]/tool/diepte/page.tsx:85` (`hasAccess = plan !== 'gratis' ||
 * creditsLeft > 0`) — die pagina importeert nu deze functie in plaats van
 * de regel opnieuw te schrijven, zodat de regel precies één keer bestaat.
 */
export function hasActivePlanAccess(plan: Tier, creditsLeft: number): boolean {
  return plan !== 'gratis' || creditsLeft > 0;
}
