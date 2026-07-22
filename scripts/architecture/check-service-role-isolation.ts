/**
 * CI-poort #3: de Supabase service-role-key mag uitsluitend gelezen worden
 * in lib/authz/service-client.ts (en genoemd worden als configuratienaam in
 * lib/authz/config.ts). Elders — met name in nieuwe/gemigreerde
 * route-bestanden — is een letterlijke verwijzing naar
 * SUPABASE_SERVICE_ROLE_KEY een teken dat de RLS-omzeilende client buiten
 * de ene, geauditeerde module om wordt geconstrueerd (bevinding B8-klasse).
 *
 * Legacy routes (lib/authz/legacy-routes.ts) worden overgeslagen — die
 * gebruiken dit patroon nog rechtstreeks totdat ze gemigreerd zijn.
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/check-service-role-isolation.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { LEGACY_ROUTES } from '../../lib/authz/legacy-routes';

const ROOT = join(__dirname, '../..');
// Werkelijke gebruiksvormen — geen kale string-match, want die zou ook
// documentatie-commentaar raken dat het patroon alleen ter uitleg noemt
// (zoals in lib/authz/resolvers.ts, dat de vervangen aanpak beschrijft).
const USAGE_PATTERNS = [
  /process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
  /requireSecret\(\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]\s*\)/,
  /env\[\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]\s*\]/,
];
const ALLOWED_FILES = ['lib/authz/service-client.ts', 'lib/authz/config.ts'];

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(relative(ROOT, full).split('\\').join('/'));
  }
}

function main() {
  const scanRoots = ['app/api', 'lib/application', 'lib/domain', 'lib/edge', 'lib/authz'];
  const files: string[] = [];
  for (const root of scanRoots) {
    const abs = join(ROOT, root);
    try { walk(abs, files); } catch { /* map bestaat niet, negeren */ }
  }

  const violations: string[] = [];

  for (const path of files) {
    if (ALLOWED_FILES.includes(path)) continue;
    if ((LEGACY_ROUTES as readonly string[]).includes(path)) continue;

    const source = readFileSync(join(ROOT, path), 'utf8');
    if (USAGE_PATTERNS.some((p) => p.test(source))) {
      violations.push(`${path}: leest SUPABASE_SERVICE_ROLE_KEY rechtstreeks. Gebruik lib/authz/service-client.ts::getServiceRoleClient().`);
    }
  }

  if (violations.length > 0) {
    console.error('Service-role-isolatie-schendingen:');
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log('✓ service-role-key alleen gebruikt binnen lib/authz/service-client.ts.');
}

main();
