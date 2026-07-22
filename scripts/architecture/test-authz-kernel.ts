/**
 * Contract- en regressietests voor de authorization-kernel en de eerste
 * gemigreerde route (bro:lookup).
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/test-authz-kernel.ts
 *
 * Test-strategie (zelfde stijl als scripts/test-support-service.ts):
 * geen framework, een fake Supabase-client, geen echte database. Delen die
 * niet zonder een echte Next.js-requestcontext of een echte Supabase-
 * verbinding te testen zijn (resolveUserPrincipal's cookies()-aanroep,
 * de deduct_credit-RPC zelf) worden hier NIET getest — zie de sectie
 * "Niet gedekt door deze tests" onderaan.
 */

import { ruleFor, validateCapabilityRegistry } from '../../lib/authz/capability';
import { hasActivePlanAccess } from '../../lib/authz/principal';
import { buildUserPrincipal } from '../../lib/authz/resolvers';
import { BroLookupInput } from '../../lib/application/bro-lookup';
import { readFileSync } from 'fs';
import { join } from 'path';

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─── Registry-invarianten ───────────────────────────────────────────────────────

console.log('\n[CAPABILITY_REGISTRY]');

const violations = validateCapabilityRegistry();
ok('geen registry-schendingen', violations.length === 0, violations.join('; '));

// ─── De facturatiegrens-beslissing vastgelegd als test (docs/architecture/bro-charging-boundary.md) ──

console.log('\n[bro:lookup — facturatiegrens]');

const broRule = ruleFor('bro:lookup');
ok(
  "bro:lookup schrijft GEEN credit af (entitlement.type !== 'consumes-credit')",
  broRule.entitlement.type !== 'consumes-credit',
  `kreeg: ${broRule.entitlement.type}`,
);
ok(
  "bro:lookup vereist wél een actief plan of credits ('requires-active-plan')",
  broRule.entitlement.type === 'requires-active-plan',
);
ok('bro:lookup vereist geen ownership (geen resource om te bezitten)', broRule.requiresOwnership === false);
ok('bro:lookup staat alleen \'user\'-principals toe (geen anonymous)',
  broRule.allowedPrincipals.length === 1 && broRule.allowedPrincipals[0] === 'user');
ok('bro:lookup is rate-limited per principal, niet per (spoofbaar) IP', broRule.rateLimit.keyedBy === 'principal');

// Structurele check: de bro-lookup-usecase importeert geen credit-mechaniek.
// Dit is de "geen dubbele afschrijving"-garantie als statische, niet-runtime-
// afhankelijke test: als iemand per ongeluk reserveCredit() in dit bestand
// zou importeren, faalt deze test vóórdat er ooit een database bij komt.
const broLookupSource = readFileSync(
  join(__dirname, '../../lib/application/bro-lookup.ts'),
  'utf8',
);
ok(
  'bro-lookup.ts importeert geen credit-ledger of pipeline/credit (structurele dubbele-afschrijving-guard)',
  !broLookupSource.includes('credit-ledger') && !broLookupSource.includes("from '@/lib/pipeline/credit'"),
);

// ─── hasActivePlanAccess — de gedeelde entitlement-regel ───────────────────────

console.log('\n[hasActivePlanAccess — gedeeld door /api/bro en app/[locale]/tool/diepte/page.tsx]');

ok('gratis plan zonder credits → geen toegang', hasActivePlanAccess('gratis', 0) === false);
ok('gratis plan MET losse credits → wel toegang (koopt buiten abonnement om)', hasActivePlanAccess('gratis', 3) === true);
ok('starter plan zonder credits → wel toegang (pagina-/API-gate, geen creditcheck)', hasActivePlanAccess('starter', 0) === true);
ok('pro plan → wel toegang', hasActivePlanAccess('pro', 0) === true);

// ─── buildUserPrincipal — met een fake Supabase-client (geen echte DB) ─────────

console.log('\n[buildUserPrincipal]');

function fakeSupabase(opts: { user: { id: string; email: string } | null; profile?: { plan: string; credits_left: number } }) {
  return {
    auth: {
      async getUser() {
        return { data: { user: opts.user } };
      },
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async single() { return { data: opts.profile ?? null }; },
      };
    },
  } as never;
}

(async () => {
  const noSession = await buildUserPrincipal(fakeSupabase({ user: null }));
  ok('geen sessie → geen principal', noSession === null);

  const gratisNoCredits = await buildUserPrincipal(
    fakeSupabase({ user: { id: 'u1', email: 'test@example.com' }, profile: { plan: 'gratis', credits_left: 0 } }),
  );
  ok('sessie + gratis plan → principal met plan=gratis', gratisNoCredits?.plan === 'gratis');
  ok('principal bevat geen extra velden die als ownership-bewijs misbruikt kunnen worden',
    gratisNoCredits !== null && Object.keys(gratisNoCredits).sort().join(',') === 'email,id,kind,plan');

  const missingProfileRow = await buildUserPrincipal(
    fakeSupabase({ user: { id: 'u2', email: 'test2@example.com' }, profile: undefined }),
  );
  ok(
    'ontbrekende profielrij faalt veilig naar plan=gratis (nooit een hogere tier aannemen)',
    missingProfileRow?.plan === 'gratis',
  );

  // ─── Input-validatie: BroLookupInput ──────────────────────────────────────
  console.log('\n[BroLookupInput schema]');

  ok('postcode alleen → geldig', BroLookupInput.safeParse({ postcode: '1071AA' }).success);
  ok('rdX/rdY/lat/lon zonder postcode → geldig', BroLookupInput.safeParse({ rdX: '1', rdY: '2', lat: '3', lon: '4' }).success);
  ok('niets meegegeven → ongeldig (voorkomt een lege/ongerichte externe lookup)', !BroLookupInput.safeParse({}).success);
  ok('lege postcode-string → ongeldig', !BroLookupInput.safeParse({ postcode: '' }).success);

  console.log(`\n${passed} geslaagd, ${failed} gefaald.\n`);
  if (failed > 0) process.exit(1);
})();
