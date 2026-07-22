/**
 * CI-poort #1: elke route.ts onder app/api MOET `defineEndpoint` gebruiken,
 * tenzij hij expliciet op de krimpende allowlist staat
 * (lib/authz/legacy-routes.ts).
 *
 * Faalt de build als:
 *  - een route geen `defineEndpoint(` aanroept EN niet op de allowlist staat
 *    (een nieuwe, onbeveiligde route zoals bevinding B1/B2/B3 zou hier op
 *    vastlopen vóórdat hij ooit gemerged wordt);
 *  - de allowlist een pad bevat dat niet meer bestaat (dode configuratie —
 *    voorkomt dat de lijst alleen maar aangroeit met verweesde entries).
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/check-route-manifest.ts
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { LEGACY_ROUTES } from '../../lib/authz/legacy-routes';

const ROOT = join(__dirname, '../..');

/**
 * Handmatige recursieve walk i.p.v. fs.globSync — die laatste is pas vanaf
 * Node 22 stabiel, terwijl CI (.github/workflows/ci.yml) Node 20 pint. Geen
 * extra dependency nodig voor iets dat drie regels handgeschreven code is.
 */
function findRouteFiles(): string[] {
  const apiRoot = join(ROOT, 'app/api');
  const found: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry === 'route.ts') {
        found.push(relative(ROOT, full).split('\\').join('/'));
      }
    }
  }

  walk(apiRoot);
  return found.sort();
}

function usesDefineEndpoint(path: string): boolean {
  const source = readFileSync(join(ROOT, path), 'utf8');
  return source.includes("from '@/lib/edge/define-endpoint'") && /defineEndpoint\s*\(/.test(source);
}

function main() {
  const violations: string[] = [];
  const routeFiles = findRouteFiles();

  for (const path of routeFiles) {
    const isLegacy = (LEGACY_ROUTES as readonly string[]).includes(path);
    const migrated = usesDefineEndpoint(path);

    if (!migrated && !isLegacy) {
      violations.push(
        `${path}: gebruikt geen defineEndpoint() en staat niet op de legacy-allowlist. ` +
        `Nieuwe routes MOETEN via lib/edge/define-endpoint.ts — zie docs/architecture/adding-a-new-endpoint.md.`,
      );
    }
    if (migrated && isLegacy) {
      violations.push(
        `${path}: staat nog op de legacy-allowlist maar gebruikt al defineEndpoint(). ` +
        `Verwijder deze regel uit lib/authz/legacy-routes.ts (de lijst mag alleen krimpen).`,
      );
    }
  }

  for (const legacyPath of LEGACY_ROUTES) {
    if (!existsSync(join(ROOT, legacyPath))) {
      violations.push(`lib/authz/legacy-routes.ts bevat "${legacyPath}", maar dat bestand bestaat niet meer — verwijder de dode entry.`);
    }
  }

  const migratedCount = routeFiles.filter(usesDefineEndpoint).length;
  console.log(`Route-manifest: ${routeFiles.length} routes totaal, ${migratedCount} gemigreerd, ${LEGACY_ROUTES.length} op de allowlist.`);

  if (violations.length > 0) {
    console.error('\nRoute-manifest-schendingen:');
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log('✓ route-manifest consistent.');
}

main();
