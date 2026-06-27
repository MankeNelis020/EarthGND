/**
 * Lokale test voor de admin import-meting API.
 *
 * Simuleert precies wat de Google Sheets Apps Script doet, maar draait
 * tegen de lokale dev server zodat je zonder Vercel-deploy kunt debuggen.
 *
 * Gebruik:
 *   1. Start de dev server:  npm run dev
 *   2. Zet IMPORT_API_KEY in .env.local (zelfde waarde als in Vercel)
 *   3. Draai dit script:     npx tsx scripts/test-import-local.ts
 *
 * Optioneel — CSV importeren:
 *   npx tsx scripts/test-import-local.ts --csv pad/naar/metingen.csv
 *
 * CSV-formaat (kommagescheiden, rij 1 = headers):
 *   straatnaam,huisnummer,postcode,woonplaats,lat,lon,field_gw_depth,
 *   bro_litho_class,bro_gw_depth,measurement_quality,notes,
 *   R_3m,R_6m,R_9m,R_12m,R_15m,R_18m,R_21m,R_24m,R_27m,R_30m
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const BASE_URL  = process.env.TEST_API_URL  ?? 'http://localhost:3000';
const API_KEY   = process.env.IMPORT_API_KEY ?? '';
const ENDPOINT  = `${BASE_URL}/api/admin/import-meting`;
const DEPTH_STEPS = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

// ─── Testdata (gebruikt als geen CSV opgegeven) ───────────────────────────────

const TEST_ROWS = [
  {
    straatnaam: 'Orkaden', huisnummer: '34', woonplaats: 'Amersfoort',
    depthCurve: [
      { depth: 3,  ra: 29.10 }, { depth: 6,  ra: 9.35 }, { depth: 9,  ra: 6.72 },
      { depth: 12, ra: 4.45  }, { depth: 15, ra: 3.80  }, { depth: 18, ra: 2.86 },
      { depth: 21, ra: 2.63  }, { depth: 24, ra: 2.48  }, { depth: 27, ra: 2.19 },
      { depth: 30, ra: 2.00  },
    ],
  },
  {
    straatnaam: 'Paddegat', huisnummer: '2', woonplaats: 'Boskoop',
    depthCurve: [
      { depth: 3, ra: 31.10 }, { depth: 6, ra: 9.29 }, { depth: 9, ra: 7.18 },
      { depth: 12, ra: 5.33 }, { depth: 15, ra: 4.52 }, { depth: 18, ra: 3.83 },
      { depth: 21, ra: 3.23 }, { depth: 24, ra: 2.90 }, { depth: 27, ra: 2.17 },
      { depth: 30, ra: 1.99 },
    ],
  },
];

// ─── CSV lezen ────────────────────────────────────────────────────────────────

function parseCsv(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV heeft geen datarijen');

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });

    const depthCurve: { depth: number; ra: number }[] = [];
    DEPTH_STEPS.forEach(d => {
      const val = parseFloat(row[`R_${d}m`] ?? '');
      if (!isNaN(val) && val > 0) depthCurve.push({ depth: d, ra: val });
    });

    if (depthCurve.length === 0) continue;

    rows.push({
      straatnaam:          row.straatnaam          || undefined,
      huisnummer:          row.huisnummer          || undefined,
      postcode:            row.postcode            || undefined,
      woonplaats:          row.woonplaats          || undefined,
      lat:                 parseFloat(row.lat)     || undefined,
      lon:                 parseFloat(row.lon)     || undefined,
      field_gw_depth:      parseFloat(row.field_gw_depth) || undefined,
      bro_litho_class:     parseInt(row.bro_litho_class)  || undefined,
      measurement_quality: row.measurement_quality || 'goed',
      notes:               row.notes              || undefined,
      depthCurve,
    });
  }
  return rows;
}

// ─── API-aanroep ──────────────────────────────────────────────────────────────

async function callApi(record: object, label: string): Promise<void> {
  console.log(`\n→ Importeren: ${label}`);
  console.log(`  Endpoint : ${ENDPOINT}`);
  console.log(`  API key  : ${API_KEY ? `ja (${API_KEY.length} tekens)` : 'ONTBREEKT — stel IMPORT_API_KEY in'}`);

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-key': API_KEY },
    body:    JSON.stringify(record),
  });

  const body = await res.json().catch(() => ({ error: 'Ongeldige JSON-respons' }));

  if (res.ok && (body as { ok?: boolean }).ok) {
    console.log(`  ✓ Geïmporteerd — id: ${(body as { id?: string }).id}`);
  } else {
    console.log(`  ✗ Fout (HTTP ${res.status}): ${(body as { error?: string }).error ?? JSON.stringify(body)}`);
  }
}

// ─── Hoofd ───────────────────────────────────────────────────────────────────

async function main() {
  const csvFlag = process.argv.indexOf('--csv');
  const rows = csvFlag !== -1
    ? parseCsv(path.resolve(process.argv[csvFlag + 1]))
    : TEST_ROWS;

  console.log(`EarthGND lokale import-test`);
  console.log(`Endpoint : ${ENDPOINT}`);
  console.log(`Rijen    : ${rows.length}`);
  console.log('─'.repeat(50));

  if (!API_KEY) {
    console.warn('\n⚠  IMPORT_API_KEY niet gevonden in omgeving.');
    console.warn('   Maak .env.local aan of exporteer de variabele:\n');
    console.warn('   IMPORT_API_KEY=jouw-sleutel npx tsx scripts/test-import-local.ts\n');
  }

  for (const row of rows) {
    const label = [row.straatnaam, row.huisnummer, row.woonplaats].filter(Boolean).join(' ') || 'onbekend adres';
    await callApi(row, label);
  }

  console.log('\n─'.repeat(50));
  console.log('Klaar.');
}

main().catch(e => { console.error(e); process.exit(1); });
