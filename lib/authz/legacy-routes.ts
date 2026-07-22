/**
 * Tijdelijke allowlist van route-bestanden die nog niet gemigreerd zijn
 * naar `defineEndpoint`. CI (scripts/architecture/check-route-manifest.ts,
 * check-import-boundaries.ts, check-service-role-isolation.ts) staat deze
 * bestanden toe om de oude patronen te gebruiken (eigen auth.getUser()-call,
 * directe service-role-client, etc.) — elke andere route.ts onder app/api
 * MOET `defineEndpoint` gebruiken of de build faalt.
 *
 * REGEL: deze lijst mag alleen KRIMPEN. scripts/architecture/
 * check-allowlist-shrinks.ts vergelijkt dit bestand met de main-branch-versie
 * en faalt de build als er een regel is TOEGEVOEGD. Migreer een route dan
 * verwijder hem hier — nooit andersom.
 *
 * Bevindingen B1/B2/B3 (bro/pdf/mail) staan hier bewust NIET meer in: die
 * zijn gemigreerd. Zie docs/architecture/migration-plan.md voor de volgorde
 * waarin de rest volgt.
 */

export const LEGACY_ROUTES = [
  'app/api/admin/import-meting/route.ts',
  'app/api/admin/pipeline-status/route.ts',
  'app/api/admin/reprocess-metingen/route.ts',
  'app/api/admin/soil-monitoring/route.ts',
  'app/api/calculations/[uuid]/access-check/route.ts',
  'app/api/calculations/[uuid]/archive/route.ts',
  'app/api/calculations/[uuid]/draft/route.ts',
  'app/api/calculations/[uuid]/notify/route.ts',
  'app/api/calculations/[uuid]/route.ts',
  'app/api/colleagues/[id]/route.ts',
  'app/api/colleagues/route.ts',
  'app/api/crm/route.ts',
  'app/api/debug-meting/route.ts',
  'app/api/diepte/calculate/route.ts',
  'app/api/email/rapport/route.ts',
  'app/api/groundwater/route.ts',
  'app/api/klic/route.ts',
  'app/api/meting/[uuid]/confirm/route.ts',
  'app/api/meting/[uuid]/evidence/route.ts',
  'app/api/meting/[uuid]/revoke/route.ts',
  'app/api/meting/[uuid]/route.ts',
  'app/api/meting/pending/route.ts',
  'app/api/opleverrapport/linkable/route.ts',
  'app/api/pdok/route.ts',
  'app/api/profile/accept-terms/route.ts',
  'app/api/profile/route.ts',
  'app/api/rapport/[id]/archive/route.ts',
  'app/api/rapport/[id]/pdf/route.ts',
  'app/api/rapport/[id]/route.ts',
  'app/api/rapport/[id]/share/route.ts',
  'app/api/rapport/[id]/sign/route.ts',
  'app/api/rapport/from-pendiepte/[uuid]/route.ts',
  'app/api/rapport/route.ts',
  'app/api/stripe/checkout/route.ts',
  'app/api/stripe/webhook/route.ts',
  'app/api/support/attachments/sign/route.ts',
  'app/api/support/conversations/[id]/messages/route.ts',
  'app/api/support/conversations/[id]/route.ts',
  'app/api/support/conversations/route.ts',
  'app/api/support/cron/notify/route.ts',
  'app/api/support/slack/events/route.ts',
  'app/api/support/slack/interactions/route.ts',
] as const;

export type LegacyRoute = (typeof LEGACY_ROUTES)[number];
