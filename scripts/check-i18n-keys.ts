import fs from 'fs';
import path from 'path';

const messagesDir = path.join(process.cwd(), 'messages');
const baseLocale = 'nl';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return typeof val === 'object' && val !== null
      ? flattenKeys(val as Record<string, unknown>, full)
      : [full];
  });
}

const baseFile = path.join(messagesDir, `${baseLocale}.json`);
const baseKeys = new Set(flattenKeys(JSON.parse(fs.readFileSync(baseFile, 'utf8'))));

const localeFiles = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json') && f !== `${baseLocale}.json`);

let hasErrors = false;

for (const file of localeFiles) {
  const locale = file.replace('.json', '');
  const keys = new Set(flattenKeys(JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf8'))));

  const missing = Array.from(baseKeys).filter(k => !keys.has(k));
  const extra   = Array.from(keys).filter(k => !baseKeys.has(k));

  if (missing.length || extra.length) {
    hasErrors = true;
    console.error(`\n❌ ${locale}.json:`);
    missing.forEach(k => console.error(`   missing: ${k}`));
    extra.forEach(k   => console.error(`   extra:   ${k}`));
  } else {
    console.log(`✅ ${locale}.json — all ${keys.size} keys present`);
  }
}

if (hasErrors) process.exit(1);
