/**
 * CI-poort #5: `lib/authz/legacy-routes.ts` mag ten opzichte van de
 * doelbranch alleen KRIMPEN, nooit groeien. Dit is het mechanisme dat
 * voorkomt dat iemand een nieuwe, onbeveiligde route toevoegt door hem
 * gewoon aan de allowlist toe te voegen in plaats van defineEndpoint te
 * gebruiken (dat zou check-route-manifest.ts anders laten slagen zonder dat
 * er iets beveiligd is).
 *
 * Vergelijkt tegen BASE_REF (default: origin/main). Als er geen git-history
 * beschikbaar is om tegen te vergelijken (bv. eerste commit van dit
 * bestand, of een lokale run zonder origin/main), wordt dit gemeld als
 * waarschuwing en NIET als falen — zodra main de baseline bevat, wordt dit
 * een harde poort.
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/check-allowlist-shrinks.ts
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const FILE = 'lib/authz/legacy-routes.ts';
const BASE_REF = process.env.BASE_REF ?? 'origin/main';

function extractRoutes(source: string): Set<string> {
  const routes = new Set<string>();
  const re = /'(app\/api\/[^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) routes.add(match[1]);
  return routes;
}

function main() {
  const currentSource = readFileSync(join(ROOT, FILE), 'utf8');
  const current = extractRoutes(currentSource);

  let baseSource: string;
  try {
    baseSource = execSync(`git show ${BASE_REF}:${FILE}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    console.warn(
      `⚠ Kon ${FILE} niet ophalen bij ${BASE_REF} (geen baseline beschikbaar in deze checkout). ` +
      `Sla de krimp-check over — zodra main deze baseline bevat, wordt dit een harde poort.`,
    );
    console.log(`Huidige allowlist bevat ${current.size} routes.`);
    return;
  }

  const base = extractRoutes(baseSource);
  const added = Array.from(current).filter((r) => !base.has(r));
  const removed = Array.from(base).filter((r) => !current.has(r));

  console.log(`Allowlist bij ${BASE_REF}: ${base.size} routes. Huidig: ${current.size} routes.`);
  if (removed.length > 0) {
    console.log(`Gemigreerd sinds ${BASE_REF} (mooi zo): ${removed.join(', ')}`);
  }

  if (added.length > 0) {
    console.error(`\n✗ Nieuwe routes toegevoegd aan de legacy-allowlist — dat mag niet:`);
    for (const r of added) console.error(`    ${r}`);
    console.error(
      `\nEen nieuwe route hoort defineEndpoint te gebruiken (zie docs/architecture/adding-a-new-endpoint.md), ` +
      `niet aan deze lijst toegevoegd te worden.`,
    );
    process.exit(1);
  }

  console.log('✓ legacy-allowlist is niet gegroeid.');
}

main();
