/**
 * CI-poort #4: verbied `any`/`as any`/`@ts-ignore`/`@ts-expect-error` binnen
 * de authorization-kernel en de gemigreerde applicatielaag zonder een
 * expliciete `SECURITY-REVIEWED:`-marker op dezelfde regel.
 *
 * Waarom dit specifiek hier en niet repo-breed: de veiligheid van
 * `AuthorizedContext<C>` (lib/authz/context.ts) staat of valt met het
 * typesysteem — de private constructor is precies wat een `as any` kan
 * omzeilen. Een repo-brede `any`-ban zou nu meteen honderden bestaande,
 * niet-security-kritische treffers geven en dus genegeerd worden; deze
 * poort is bewust smal en daardoor serieus te nemen.
 *
 * Draai met: npx tsx --tsconfig tsconfig.json scripts/architecture/check-escape-hatches.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '../..');
const SCAN_ROOTS = ['lib/authz', 'lib/edge', 'lib/application', 'lib/domain'];
const SCAN_FILES = ['app/api/bro/route.ts', 'app/api/pdf/route.ts', 'app/api/mail/route.ts'];

const ESCAPE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /:\s*any\b/, label: "':\\s*any' typeannotatie" },
  { pattern: /\bas\s+any\b/, label: "'as any' typecast" },
  { pattern: /@ts-ignore/, label: '@ts-ignore' },
  { pattern: /@ts-expect-error/, label: '@ts-expect-error' },
];

function collectFiles(): string[] {
  const files: string[] = [...SCAN_FILES];
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    try {
      (function walk(dir: string) {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(relative(ROOT, full).split('\\').join('/'));
        }
      })(abs);
    } catch { /* map bestaat niet */ }
  }
  return Array.from(new Set(files));
}

function main() {
  const violations: string[] = [];
  const reviewed: string[] = [];

  for (const path of collectFiles()) {
    const abs = join(ROOT, path);
    let source: string;
    try { source = readFileSync(abs, 'utf8'); } catch { continue; }

    source.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      // Documentatie mag het patroon ter uitleg noemen (zoals dit bestand
      // zelf doet) zonder als schending te tellen.
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

      for (const { pattern, label } of ESCAPE_PATTERNS) {
        if (pattern.test(line)) {
          const hasReviewMarker = line.includes('SECURITY-REVIEWED:');
          const entry = `${path}:${i + 1}: ${label} — "${line.trim()}"`;
          if (hasReviewMarker) reviewed.push(entry);
          else violations.push(`${entry}\n    → voeg "// SECURITY-REVIEWED: <reden>" toe op dezelfde regel als dit bewust is, of los het op.`);
        }
      }
    });
  }

  if (reviewed.length > 0) {
    console.log('Bewust gereviewde escape hatches (toegestaan, blijft zichtbaar):');
    for (const r of reviewed) console.log(`  ⚠ ${r}`);
  }

  if (violations.length > 0) {
    console.error('\nNiet-gereviewde authorization-escape-hatches:');
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log('✓ geen ongereviewde any/ts-ignore/ts-expect-error in de authz-kernel.');
}

main();
