/**
 * Fail-closed configuratie.
 *
 * Root cause die dit bestand wegneemt: elke bestaande "if (secret) { check }"
 * in de oude routes (admin/pipeline-status, admin/soil-monitoring,
 * support/cron/notify) sloeg de autorisatie stilzwijgend over zodra de
 * env-var ontbrak. Dat is "fail-open bij misconfiguratie" — bevinding B4/B11
 * in het auditrapport.
 *
 * requireSecret() kan dat patroon niet meer reproduceren: een ontbrekend
 * secret is altijd een throw, nooit een undefined die per ongeluk als
 * "geen check nodig" wordt gelezen.
 */

const REQUIRED_IN_PRODUCTION = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'ADMIN_EMAILS',
  'INTERNAL_API_SECRET',
] as const;

/**
 * Roep dit aan bij het opstarten van het serverproces (instrumentation.ts),
 * niet per request — dit hoort een deploy te blokkeren, niet een gebruiker.
 */
export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Ontbrekende verplichte environment-variabelen in productie: ${missing.join(', ')}. ` +
      `Zie docs/architecture/secure-endpoints-guide.md.`,
    );
  }
}

/**
 * Enige toegestane manier om aan een secret te komen. Geeft nooit undefined
 * terug — een ontbrekend secret is een serverfout (500), nooit een impliciete
 * "sla de check maar over".
 */
export function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Secret "${name}" is niet geconfigureerd op deze server.`);
  }
  return value;
}

/** Voor optionele functionaliteit (bv. Resend) waar "niet geconfigureerd" een geldige, expliciete toestand is. */
export function optionalSecret(name: string): string | null {
  return process.env[name] || null;
}

/** ADMIN_EMAILS is een lijst; leeg is in productie een configuratiefout, niet "iedereen mag". */
export function adminEmailAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
