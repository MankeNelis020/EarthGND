/**
 * Capability / action-resource-registry (vereiste #2 en #11).
 *
 * Dit bestand is het businessmodel van EarthGND als data. Elke capability
 * hier is één regel — niet verspreid over routes zoals vóór deze migratie.
 *
 * BELANGRIJK: dit register bevat uitsluitend capabilities die daadwerkelijk
 * gemigreerd zijn naar `defineEndpoint`. Het wordt route-voor-route
 * uitgebreid (eerst `bro:lookup`, dan `report:*` bij de pdf/mail-migratie),
 * niet in één keer vooruit ingevuld met speculatieve entries — een entry
 * die geen route bedient is dode configuratie en verhult juist welke
 * routes nog legacy zijn.
 *
 * `EntitlementRule` modelleert precies de twee toegangsregels die al in de
 * repo bestaan — geen derde, fictieve regel:
 *   - 'requires-active-plan': `plan !== 'gratis' || credits_left > 0`,
 *     zoals vandaag al de paginagate is in
 *     `app/[locale]/tool/diepte/page.tsx:85`. Schrijft niets af.
 *   - 'consumes-credit': atomaire reserve → capture/release van N credits,
 *     zoals vandaag al gebeurt in `lib/pipeline/credit.ts`.
 * Zie docs/architecture/bro-charging-boundary.md voor de motivatie waarom
 * `bro:lookup` de eerste regel gebruikt en niet de tweede.
 */

import type { PrincipalKind } from './principal';

export interface RateLimitSpec {
  limit: number;
  windowSeconds: number;
  /**
   * 'principal' = per ingelogde gebruiker/admin — vereist geen IP-aanname.
   * 'ip' = voor anonieme/publieke acties, via de getrouwde IP-resolver in
   * lib/authz/rate-limit.ts. Zolang Vercel's x-forwarded-for-gedrag niet
   * runtime-geverifieerd is (open vraag uit het auditrapport), blijft
   * 'principal' de voorkeur voor elke capability die toch al inloggen eist.
   */
  keyedBy: 'principal' | 'ip';
}

export type EntitlementRule =
  | { type: 'none' }
  | { type: 'requires-active-plan' }
  | { type: 'consumes-credit'; cost: number };

export interface CapabilityRule {
  description: string;
  allowedPrincipals: readonly PrincipalKind[];
  entitlement: EntitlementRule;
  requiresOwnership: boolean;
  rateLimit: RateLimitSpec;
  audit: boolean;
  idempotency: 'required' | 'none';
}

export const CAPABILITY_REGISTRY = {
  'report:generate-ohm': {
    description:
      'PDF-rapport voor de gratis Ohm-tool. Herberekent het resultaat server-side ' +
      'via calcOhmWizard() (docs/contracts.md §A) — vertrouwt nooit een door de ' +
      'client aangeleverd "results"-object (dat was bevinding B2 voor deze route).',
    allowedPrincipals: ['anonymous', 'user'],
    entitlement: { type: 'none' },
    requiresOwnership: false,
    rateLimit: { limit: 20, windowSeconds: 60, keyedBy: 'ip' },
    audit: false,
    idempotency: 'none',
  },
  'report:generate-diepte': {
    description:
      'PDF-rapport voor een reeds uitgevoerde (en dus al betaalde) Diepte-berekening. ' +
      'Laadt input/resultaat uitsluitend uit de server-side opgeslagen `calculations`-rij ' +
      '(docs/contracts.md §B) — accepteert nooit een client-aangeleverd resultaat-object. ' +
      'Geen aparte credit-eis: toegang is volledig bepaald door ownership van de al-betaalde ' +
      'rij, niet door een actueel plan (zie docs/architecture/report-generate-diepte-entitlement.md).',
    allowedPrincipals: ['user'],
    entitlement: { type: 'none' },
    requiresOwnership: true,
    rateLimit: { limit: 20, windowSeconds: 60, keyedBy: 'principal' },
    audit: true,
    idempotency: 'none',
  },
  'report:email': {
    description:
      'Een reeds gegenereerd rapport naar het eigen, geverifieerde e-mailadres sturen. ' +
      'Was bevinding B3: vrij te kiezen ontvanger, vrije pdfUrl-link en ongesaneerde HTML. ' +
      'Ontvanger is nu altijd de ingelogde principal zelf — er is geen "to"-veld in het schema.',
    allowedPrincipals: ['user'],
    entitlement: { type: 'none' },
    requiresOwnership: true,
    rateLimit: { limit: 10, windowSeconds: 300, keyedBy: 'principal' },
    audit: true,
    idempotency: 'none',
  },
  'bro:lookup': {
    description:
      'BRO/GeoTOP-bodemdata per adres — het betaalde onderscheid van de Diepte-calculator. ' +
      'Was bevinding B1: volledig ongeauthenticeerd en credit-vrij bereikbaar via curl. ' +
      'Schrijft geen credit af (zie bro-charging-boundary.md) — vereist dezelfde ' +
      'toegangsdrempel als de Diepte-pagina zelf.',
    allowedPrincipals: ['user'],
    entitlement: { type: 'requires-active-plan' },
    requiresOwnership: false,
    rateLimit: { limit: 30, windowSeconds: 60, keyedBy: 'principal' },
    audit: true,
    idempotency: 'none',
  },
} as const satisfies Record<string, CapabilityRule>;

export type Capability = keyof typeof CAPABILITY_REGISTRY;

export function ruleFor<C extends Capability>(capability: C): CapabilityRule {
  return CAPABILITY_REGISTRY[capability];
}

/**
 * Registry-invarianten. Draait bij elke build
 * (scripts/architecture/verify-capability-registry.ts) én bij module-load
 * in niet-productie, zodat een schending nooit levend het register in kan.
 */
export function validateCapabilityRegistry(): string[] {
  const violations: string[] = [];

  // `CAPABILITY_REGISTRY` is `as const`, dus TypeScript zou elke entry naar
  // zijn eigen letterlijke (te smalle) subtype infereren i.p.v. het
  // algemene `CapabilityRule`. Deze cast herstelt dat voor de generieke
  // invariant-checks hieronder — de `as const` blijft intact voor
  // `Capability`/`ruleFor()`, die juist wél de letterlijke sleutels nodig
  // hebben.
  const entries = Object.entries(CAPABILITY_REGISTRY) as [string, CapabilityRule][];

  for (const [name, rule] of entries) {
    const isAnonymous = rule.allowedPrincipals.includes('anonymous');

    if (isAnonymous && rule.requiresOwnership) {
      violations.push(`${name}: anonieme principal kan geen ownership-check doorstaan.`);
    }
    if (isAnonymous && rule.entitlement.type !== 'none') {
      violations.push(`${name}: anonieme principal mag nooit een plan/credit-eis hebben.`);
    }
    if (rule.allowedPrincipals.length === 0) {
      violations.push(`${name}: geen enkele principal mag dit aanroepen — dood register-item.`);
    }
    if (rule.entitlement.type === 'consumes-credit' && rule.entitlement.cost <= 0) {
      violations.push(`${name}: 'consumes-credit' met cost <= 0 — gebruik 'none' of 'requires-active-plan'.`);
    }
    if (!name.includes(':')) {
      violations.push(`${name}: capability-naam moet het formaat "resource:actie" volgen.`);
    }
  }

  return violations;
}

if (process.env.NODE_ENV !== 'production') {
  const violations = validateCapabilityRegistry();
  if (violations.length > 0) {
    throw new Error(`CAPABILITY_REGISTRY-schending:\n${violations.join('\n')}`);
  }
}
