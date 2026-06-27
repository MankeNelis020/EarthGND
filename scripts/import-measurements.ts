/**
 * Handmatige metingen importeren in de kennisbank.
 *
 * Gebruik:
 *   npm run import:metingen -- --seed           (zaait de 5 kalibratiemetingen)
 *   npm run import:metingen -- --file data.json  (importeer JSON-bestand)
 *   npm run import:metingen -- --seed --dry-run  (simuleer, schrijf niets)
 *
 * JSON-formaat (array van ImportRecord):
 *   [{
 *     "label": "IJmuiden – Trawlerkade 4",
 *     "address": "Trawlerkade 4, 1976 CB IJmuiden",
 *     "gwDepth": 2.0,
 *     "broLithoClass": 3,
 *     "broGwDepth": 1.807,
 *     "broBoringAfstand": 0.2,
 *     "depthCurve": [{"depth": 3, "ra": 31.015}, ...],
 *     "measurementQuality": "goed",
 *     "notes": ""
 *   }]
 *
 * Het script:
 *   1. Geocodeert het adres (of gebruikt lat/lon direct)
 *   2. Maakt een pendiepte_metingen rij aan (status='confirmed', source_type='manual_import')
 *   3. Roept processMeting aan → soil_evidence + global_prior + regional_prior
 *
 * Handmatige metingen zijn architectureel identiek aan veldmonteur-metingen.
 * source_type='manual_import' onderscheidt ze in de DB — verder identieke verwerking.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { forwardGeocode } from '../lib/geocoding';
import { processMeting } from '../lib/soil-knowledge/evidence-accumulator';
import { FIELD_LOCATIONS } from '../lib/calibration/field-data';
import { wgs84ToRd } from '../lib/rd';
import type { ImportRecord } from '../lib/soil-knowledge/types';

// Env vars worden verwacht via shell of CI-omgeving.
// Lokaal: export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import:metingen

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const seed   = args.includes('--seed');
const dryRun = args.includes('--dry-run');
const fileIdx = args.indexOf('--file');
const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;

function log(msg: string) { process.stderr.write(msg + '\n'); }
function section(t: string) { log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`); }

if (!seed && !filePath) {
  log('Gebruik: --seed | --file <pad.json>  [--dry-run]');
  log('');
  log('  --seed        Zaait de 5 kalibratiemetingen vanuit lib/calibration/field-data.ts');
  log('  --file        Importeert JSON-bestand (array van ImportRecord)');
  log('  --dry-run     Simuleert import — niets schrijven naar database');
  process.exit(1);
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ─── Import ───────────────────────────────────────────────────────────────────

async function importRecord(rec: ImportRecord): Promise<string | null> {
  let lat = rec.lat;
  let lon = rec.lon;

  if ((!lat || !lon) && rec.address) {
    log(`  · Geocoding: ${rec.address}`);
    const geo = await forwardGeocode(rec.address);
    if (!geo) {
      log(`  ✗ Geocoding mislukt: ${rec.address}`);
      return null;
    }
    lat = geo.lat;
    lon = geo.lon;
  }

  if (!lat || !lon) {
    log(`  ✗ Geen coördinaten voor: ${rec.label}`);
    return null;
  }

  const rd = lat != null && lon != null ? wgs84ToRd(lat, lon) : null;

  const row = {
    source_type:        'manual_import',
    status:             'confirmed',
    lat,
    lon,
    gps_accuracy_m:     null,
    location_source:    'manual_import',
    rd_x:               rd ? Math.round(rd.rdX) : null,
    rd_y:               rd ? Math.round(rd.rdY) : null,
    postcode:           null,
    straatnaam:         rec.address ?? null,
    huisnummer:         null,
    woonplaats:         null,
    depth_curve:        rec.depthCurve,
    achieved_ra:        rec.depthCurve.at(-1)?.ra ?? null,
    installed_depth:    rec.depthCurve.at(-1)?.depth ?? null,
    electrode_type:     'pen',
    notes:              rec.notes ?? null,
    measurement_quality: rec.measurementQuality ?? 'goed',
    electrode_count:    rec.electrodeCount ?? 1,
    bro_litho_class:    rec.broLithoClass ?? null,
    bro_rho_wet:        rec.broRhoWet ?? null,
    bro_gw_depth:       rec.broGwDepth ?? null,
    bro_boring_afstand: rec.broBoringAfstand ?? null,
    field_gw_depth:     rec.gwDepth,
    version_tag:        '2026-06',
    submitted_at:       new Date().toISOString(),
    confirmed_at:       new Date().toISOString(),
  };

  if (dryRun) {
    log(`  [dry-run] invoegen: ${rec.label} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
    log(`            dieptecurve: ${rec.depthCurve.length} punten, gw=${rec.gwDepth} m`);
    return 'dry-run-id';
  }

  const { data, error } = await supabase
    .from('pendiepte_metingen')
    .insert(row)
    .select('id')
    .single();

  if (error || !data) {
    log(`  ✗ DB-fout: ${error?.message}`);
    return null;
  }

  log(`  ✓ Ingevoegd → ${data.id}`);
  return data.id as string;
}

// ─── Records ophalen ──────────────────────────────────────────────────────────

async function buildSeedRecords(): Promise<ImportRecord[]> {
  const records: ImportRecord[] = [];

  for (const loc of FIELD_LOCATIONS) {
    // Laad BRO-cache als die bestaat (van een eerdere fase0-counterfactual run)
    let broLithoClass: number | undefined;
    let broGwDepth: number | undefined;
    let broBoringAfstand: number | undefined;

    const cachePath = `.calibration-cache/${loc.id}.json`;
    if (existsSync(cachePath)) {
      try {
        const bro = JSON.parse(readFileSync(cachePath, 'utf8'));
        broLithoClass    = bro.samples?.[0]?.lithoClass;
        broGwDepth       = bro.groundwaterDepth;
        broBoringAfstand = bro.boringAfstand;
      } catch { /* cache onleesbaar — geen BRO-info */ }
    }

    records.push({
      label:              loc.label,
      lat:                loc.coords?.lat,
      lon:                loc.coords?.lon,
      address:            loc.address,
      gwDepth:            loc.groundwaterDepthM,
      broLithoClass,
      broGwDepth,
      broBoringAfstand,
      depthCurve:         loc.depthCurve.map(p => ({ depth: p.depthM, ra: p.rMeasured })),
      measurementQuality: 'goed',
      electrodeCount:     1,
      notes:              'Geseed vanuit EarthGND-veldmetingen.xlsx — fase 0 kalibratieset (2026-06)',
    });
  }

  return records;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  section(dryRun ? 'Import (DRY RUN — niets schrijven)' : 'Import metingen naar kennisbank');

  let records: ImportRecord[];

  if (seed) {
    log(`  Bron: lib/calibration/field-data.ts (${FIELD_LOCATIONS.length} locaties)`);
    records = await buildSeedRecords();
  } else {
    if (!filePath || !existsSync(filePath)) {
      log(`Bestand niet gevonden: ${filePath}`);
      process.exit(1);
    }
    log(`  Bron: ${filePath}`);
    records = JSON.parse(readFileSync(filePath!, 'utf8')) as ImportRecord[];
  }

  log(`  ${records.length} record(s) te verwerken\n`);

  let ok = 0;
  let fail = 0;

  for (const rec of records) {
    section(`${rec.label}`);
    const id = await importRecord(rec);

    if (!id) {
      fail++;
      continue;
    }

    if (!dryRun) {
      try {
        const result = await processMeting(id, supabase as any);
        log(`  ✓ Kennisbank bijgewerkt: ${result.pointsProcessed} punten, ${result.evidenceInserted} evidence-rijen`);
      } catch (e) {
        log(`  ⚠ Kennisbank-verwerking mislukt: ${e}`);
      }
    }

    ok++;
  }

  section('Samenvatting');
  log(`  OK:       ${ok}`);
  log(`  Mislukt:  ${fail}`);
  if (dryRun) log(`  (dry-run: geen wijzigingen opgeslagen)`);
}

main().catch(e => {
  log(`Fatal: ${e}`);
  process.exit(1);
});
