/**
 * Contract- en regressietests voor 'report:generate-ohm' en
 * 'report:generate-diepte' (migratie van bevinding B2).
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/test-report-generate.ts
 */

import { ruleFor } from '../../lib/authz/capability';
import { OhmReportInput, DiepteReportInput } from '../../lib/application/report-generate';
import { getOwnedCalculation, findCalculationOwnerId } from '../../lib/domain/calculation-repository';

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

console.log('\n[report:generate-ohm / report:generate-diepte — registry]');

const ohmRule = ruleFor('report:generate-ohm');
ok('ohm-rapport: geen ownership vereist (geen resource om te bezitten)', ohmRule.requiresOwnership === false);
ok('ohm-rapport: geen plan/credit-eis (blijft gratis)', ohmRule.entitlement.type === 'none');
ok('ohm-rapport: staat anonieme aanroepers toe', ohmRule.allowedPrincipals.includes('anonymous'));

const dieptePdfRule = ruleFor('report:generate-diepte');
ok('diepte-rapport: ownership VERPLICHT (bevinding B2)', dieptePdfRule.requiresOwnership === true);
ok('diepte-rapport: alleen \'user\'-principals, geen anonymous', !dieptePdfRule.allowedPrincipals.includes('anonymous'));

// ─── De kern van bevinding B2, als test: het schema kent geen "results"-veld ──

console.log('\n[B2-regressieguard: geen client-aangeleverd resultaat-object mogelijk]');

const ohmWithFakeResult = OhmReportInput.safeParse({
  tool: 'ohm',
  customerType: 'particulier',
  installationType: 'woning',
  results: { maxResistance: '0.01 Ω — vervalst' }, // aanvaller probeert het oude contract
});
ok('OhmReportInput accepteert de invoer (geldige velden zijn aanwezig)', ohmWithFakeResult.success);
ok(
  'maar "results" wordt NIET doorgegeven aan de handler — het bestaat niet in het schema',
  ohmWithFakeResult.success && !('results' in ohmWithFakeResult.data),
);

const dieptePayload = { tool: 'diepte' as const, calculationId: '550e8400-e29b-41d4-a716-446655440000' };
const dieptWithFakeResult = DiepteReportInput.safeParse({
  ...dieptePayload,
  results: { achievedResistance: '0.01 Ω — vervalst' },
  inputValues: { rho: 1 },
});
ok('DiepteReportInput accepteert alleen een calculationId', dieptWithFakeResult.success);
ok(
  '"results"/"inputValues" van de client worden genegeerd — het rapport komt uit de database, niet uit dit schema',
  dieptWithFakeResult.success &&
    !('results' in dieptWithFakeResult.data) &&
    !('inputValues' in dieptWithFakeResult.data),
);
ok('calculationId moet een geldige UUID zijn (voorkomt trivialen bypass-pogingen)',
  !DiepteReportInput.safeParse({ tool: 'diepte', calculationId: 'niet-een-uuid' }).success);

// ─── Ownership: IDOR-poging via calculation-repository ─────────────────────────

console.log('\n[calculation-repository — IDOR-guard]');

function fakeCalculationsClient(row: { id: string; user_id: string } | null) {
  return {
    from() {
      return {
        select() { return this; },
        eq(column: string, value: string) {
          if (column === 'user_id' && row && value !== row.user_id) {
            // simuleert dat de rij bestaat maar van een ANDERE user is —
            // een correcte implementatie mag hem dan niet teruggeven.
            (this as { __blocked?: boolean }).__blocked = true;
          }
          return this;
        },
        async maybeSingle() {
          if ((this as { __blocked?: boolean }).__blocked) return { data: null };
          return { data: row };
        },
      };
    },
  } as never;
}

(async () => {
  const victimRow = { id: 'calc-1', user_id: 'victim-user' };

  const ownerFound = await findCalculationOwnerId(fakeCalculationsClient(victimRow), 'calc-1');
  ok('findCalculationOwnerId geeft de echte eigenaar terug', ownerFound === 'victim-user');

  const attackerAttempt = await getOwnedCalculation(fakeCalculationsClient(victimRow), 'calc-1', 'attacker-user');
  ok(
    'getOwnedCalculation geeft NIETS terug als het opgegeven ownerId niet de echte eigenaar is (IDOR geblokkeerd)',
    attackerAttempt === null,
  );

  const legitimateAccess = await getOwnedCalculation(fakeCalculationsClient(victimRow), 'calc-1', 'victim-user');
  ok('getOwnedCalculation geeft de rij terug aan de echte eigenaar', legitimateAccess?.user_id === 'victim-user');

  console.log(`\n${passed} geslaagd, ${failed} gefaald.\n`);
  if (failed > 0) process.exit(1);
})();
