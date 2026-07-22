/**
 * CI-poort #2: importgrenzen.
 *
 * Route-bestanden (behalve legacy) mogen de database niet rechtstreeks
 * aanraken — geen `@supabase/supabase-js`-import, geen `@/utils/supabase/*`.
 * Alle databasetoegang loopt via lib/application/** → lib/domain/** →
 * lib/authz/service-client.ts. Dit is de vereiste "geen businesslogica of
 * directe databasetoegang in routes" mechanisch afgedwongen, niet een
 * stijlregel.
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/check-import-boundaries.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { LEGACY_ROUTES } from '../../lib/authz/legacy-routes';

const ROOT = join(__dirname, '../..');
const FORBIDDEN_IN_ROUTES = [
  { pattern: /from ['"]@supabase\/supabase-js['"]/, reason: 'directe Supabase-client-import' },
  { pattern: /from ['"]@\/utils\/supabase\/server['"]/, reason: 'directe RLS-client-import — hoort in lib\/application of lib\/domain' },
];

function findRouteFiles(): string[] {
  const apiRoot = join(ROOT, 'app/api');
  const found: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'route.ts') found.push(relative(ROOT, full).split('\\').join('/'));
    }
  }
  walk(apiRoot);
  return found.sort();
}

function main() {
  const violations: string[] = [];

  for (const path of findRouteFiles()) {
    if ((LEGACY_ROUTES as readonly string[]).includes(path)) continue; // legacy mag nog, tijdelijk

    const source = readFileSync(join(ROOT, path), 'utf8');
    for (const { pattern, reason } of FORBIDDEN_IN_ROUTES) {
      if (pattern.test(source)) {
        violations.push(`${path}: ${reason}. Verplaats databasetoegang naar lib/application/** of lib/domain/**.`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('Importgrens-schendingen:');
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log('✓ importgrenzen gerespecteerd door alle gemigreerde routes.');
}

main();
