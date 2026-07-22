/**
 * Verzamel-runner voor alle CI-poorten uit scripts/architecture/**, plus de
 * contract-/regressietests voor de gemigreerde routes. Eén commando voor
 * lokaal gebruik en voor CI (.github/workflows/ci.yml).
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/verify-architecture.ts
 */

import { execFileSync } from 'child_process';
import { join } from 'path';

const ROOT = join(__dirname, '..');

const CHECKS = [
  'scripts/architecture/check-route-manifest.ts',
  'scripts/architecture/check-import-boundaries.ts',
  'scripts/architecture/check-service-role-isolation.ts',
  'scripts/architecture/check-escape-hatches.ts',
  'scripts/architecture/check-allowlist-shrinks.ts',
  'scripts/architecture/test-authz-kernel.ts',
  'scripts/architecture/test-report-generate.ts',
  'scripts/architecture/test-report-email.ts',
];

let failed = false;

for (const script of CHECKS) {
  console.log(`\n▶ ${script}`);
  try {
    execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.json', script], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    failed = true;
  }
}

if (failed) {
  console.error('\n✗ verify-architecture: één of meer controles zijn gefaald.');
  process.exit(1);
}
console.log('\n✓ verify-architecture: alle controles geslaagd.');
