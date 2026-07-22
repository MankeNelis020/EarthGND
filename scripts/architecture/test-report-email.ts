/**
 * Contract- en regressietests voor 'report:email' (migratie van bevinding B3).
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/test-report-email.ts
 */

import { ruleFor } from '../../lib/authz/capability';
import { ReportEmailInput } from '../../lib/application/report-email';

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

console.log('\n[report:email — registry]');

const rule = ruleFor('report:email');
ok('ownership verplicht (moet je eigen berekening zijn)', rule.requiresOwnership === true);
ok('alleen \'user\'-principals — geen anonymous, geen webhook', rule.allowedPrincipals.length === 1 && rule.allowedPrincipals[0] === 'user');

console.log('\n[B3-regressieguard: geen "to", geen "pdfUrl", geen "result" van de client]');

const attackerPayload = {
  calculationId: '550e8400-e29b-41d4-a716-446655440000',
  to: 'slachtoffer@bedrijf.nl',                 // oud contract — mag geen effect meer hebben
  pdfUrl: 'https://evil-domain.example/phish',    // oud contract
  result: { 'Klik hier': '<a href="https://evil-domain.example">verifieer</a>' }, // oud contract, HTML-injectie
};

const parsed = ReportEmailInput.safeParse(attackerPayload);
ok('schema accepteert de geldige velden (calculationId, locale)', parsed.success);
ok(
  '"to" wordt genegeerd — de ontvanger kan nooit uit de body komen',
  parsed.success && !('to' in parsed.data),
);
ok(
  '"pdfUrl" wordt genegeerd — er is geen vrije link meer in de e-mail',
  parsed.success && !('pdfUrl' in parsed.data),
);
ok(
  '"result" wordt genegeerd — de inhoud komt uit de eigen, opgeslagen rij',
  parsed.success && !('result' in parsed.data),
);

ok('ontbrekende calculationId → ongeldig', !ReportEmailInput.safeParse({}).success);
ok('niet-UUID calculationId → ongeldig', !ReportEmailInput.safeParse({ calculationId: 'sql-injection-poging; DROP TABLE' }).success);

console.log(`\n${passed} geslaagd, ${failed} gefaald.\n`);
if (failed > 0) process.exit(1);
