/**
 * EarthGND Meting Importer — Google Apps Script
 *
 * Kolommen tab "Metingen" (rij 1 = headers):
 *   A straatnaam | B huisnummer | C postcode | D woonplaats
 *   E lat | F lon | G field_gw_depth | H bro_litho_class | I bro_gw_depth
 *   J measurement_quality | K notes
 *   L–U R_3m … R_30m (kolommen 12–21)
 *   V status | W Supabase meting_id
 *   X elektrode_diameter_mm (optioneel, default 14) | Y stopreden (optioneel)
 *
 * Setup:
 *   1. Plak in Extensions → Apps Script
 *   2. Menu EarthGND → Stel API-sleutel in (zelfde als IMPORT_API_KEY in Vercel)
 *   3. Supabase: voer knowledge_production_migration.sql uit (external_import_id)
 */

var CONFIG = {
  API_URL: 'https://earthgnd.com/api/admin/import-meting',
  SHEET_NAME: 'Metingen',
  FIRST_DATA_ROW: 2,
  STATUS_COL: 22, // V
  ID_COL: 23      // W
};

var DEPTH_STEPS = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EarthGND')
    .addItem('Nu importeren', 'importNewRows')
    .addSeparator()
    .addItem('Activeer automatisch importeren (elke 5 min)', 'installTrigger')
    .addItem('Verwijder automatische trigger', 'removeTrigger')
    .addSeparator()
    .addItem('Stel API-sleutel in', 'promptApiKey')
    .addItem('Test API-call', 'testApiCall')
    .addItem('Debug rijen', 'debugRows')
    .addItem('Statuskolommen legen (herimport)', 'clearStatuses')
    .addToUi();
}

function promptApiKey() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'EarthGND API-sleutel',
    'Voer de IMPORT_API_KEY in uit Vercel:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(
      'IMPORT_API_KEY',
      result.getResponseText().trim()
    );
    ui.alert('✓ API-sleutel opgeslagen.');
  }
}

function installTrigger() {
  removeTrigger();

  ScriptApp.newTrigger('importNewRows')
    .timeBased()
    .everyMinutes(5)
    .create();

  SpreadsheetApp.getUi().alert('✓ Automatisch importeren actief (elke 5 min).');
}

function removeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === 'importNewRows';
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t);
    });
}

/** Unieke sleutel voor dedup in Supabase (external_import_id). */
function buildExternalImportId(rowNum, postcode, huisnummer) {
  var pc = String(postcode || '').replace(/\s/g, '').toUpperCase();
  var hn = String(huisnummer || '').trim();
  if (pc && hn) return 'sheet:' + pc + ':' + hn;
  return 'sheet:row:' + rowNum;
}

function normalizeCoord(val, isLat) {
  if (val === '' || val === null || val === undefined) return null;

  var n = Number(val);
  if (isNaN(n) || n === 0) return null;

  var min = isLat ? 50.5 : 3.2;
  var max = isLat ? 53.8 : 7.4;

  if (n >= min && n <= max) return n;

  var d6 = n / 1000000;
  if (d6 >= min && d6 <= max) return d6;

  var d5 = n / 100000;
  if (d5 >= min && d5 <= max) return d5;

  var d4 = n / 10000;
  if (d4 >= min && d4 <= max) return d4;

  return null;
}

function parseNumber(val) {
  if (val === '' || val === null || val === undefined) return null;

  var normalized = String(val).replace(',', '.').trim();
  var n = Number(normalized);

  return isNaN(n) ? null : n;
}

function buildDepthCurve(row) {
  var depthCurve = [];

  for (var d = 0; d < DEPTH_STEPS.length; d++) {
    var value = parseNumber(row[11 + d]);

    if (value !== null && value > 0) {
      depthCurve.push({
        depth: DEPTH_STEPS[d],
        ra: value
      });
    }
  }

  return depthCurve;
}

function importNewRows() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('IMPORT_API_KEY');

  if (!apiKey) {
    Logger.log('Geen API-sleutel geconfigureerd. Gebruik menu EarthGND → Stel API-sleutel in.');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    Logger.log('Sheet "' + CONFIG.SHEET_NAME + '" niet gevonden.');
    return;
  }

  var lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.FIRST_DATA_ROW) {
    Logger.log('Geen datarijen gevonden.');
    return;
  }

  var data = sheet.getRange(CONFIG.FIRST_DATA_ROW, 1, lastRow, CONFIG.ID_COL).getValues();

  var imported = 0;
  var errors = 0;
  var skipped = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowNum = CONFIG.FIRST_DATA_ROW + i;

    var status = String(row[CONFIG.STATUS_COL - 1] || '').trim();

    if (status.indexOf('✓') === 0 || status.indexOf('✗') === 0) {
      skipped++;
      continue;
    }

    var straatnaam = String(row[0] || '').trim();
    var huisnummer = String(row[1] || '').trim();
    var postcode = String(row[2] || '').trim();
    var lat = normalizeCoord(row[4], true);
    var lon = normalizeCoord(row[5], false);
    var depthCurve = buildDepthCurve(row);

    if (!straatnaam && lat === null && depthCurve.length === 0) {
      skipped++;
      continue;
    }

    if (depthCurve.length === 0) {
      skipped++;
      Logger.log('Rij ' + rowNum + ' overgeslagen: geen geldige R_3m t/m R_30m waarden.');
      continue;
    }

    var record = {
      external_import_id: buildExternalImportId(rowNum, postcode, huisnummer),
      straatnaam: straatnaam || null,
      huisnummer: huisnummer || null,
      postcode: postcode || null,
      woonplaats: String(row[3] || '').trim() || null,
      lat: lat,
      lon: lon,
      field_gw_depth: parseNumber(row[6]),
      bro_litho_class: parseNumber(row[7]),
      bro_gw_depth: parseNumber(row[8]),
      measurement_quality: String(row[9] || 'goed').trim() || 'goed',
      notes: String(row[10] || '').trim() || null,
      elektrode_diameter_mm: parseNumber(row[23]) || 14,
      stopreden: String(row[24] || 'onbekend').trim() || 'onbekend',
      depthCurve: depthCurve
    };

    var result = callApi(apiKey, record);

    if (result.ok) {
      if (result.duplicate) {
        sheet.getRange(rowNum, CONFIG.STATUS_COL).setValue('✓ al in Supabase');
      } else {
        sheet.getRange(rowNum, CONFIG.STATUS_COL).setValue('✓ geïmporteerd');
      }
      sheet.getRange(rowNum, CONFIG.ID_COL).setValue(result.id || '');
      imported++;
    } else {
      sheet.getRange(rowNum, CONFIG.STATUS_COL).setValue('✗ fout: ' + result.error);
      errors++;
    }

    Utilities.sleep(300);
  }

  Logger.log(
    'Klaar: ' +
    imported + ' geïmporteerd, ' +
    errors + ' fouten, ' +
    skipped + ' overgeslagen.'
  );
}

function callApi(apiKey, record) {
  try {
    var response = UrlFetchApp.fetch(CONFIG.API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-import-key': apiKey
      },
      payload: JSON.stringify(record),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var text = response.getContentText();

    var body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return {
        ok: false,
        error: 'Geen JSON response. HTTP ' + code + ': ' + text
      };
    }

    if (code >= 200 && code < 300 && body.ok) {
      return {
        ok: true,
        id: body.id,
        duplicate: body.duplicate === true
      };
    }

    return {
      ok: false,
      error: body.error || ('HTTP ' + code + ': ' + text)
    };

  } catch (e) {
    return {
      ok: false,
      error: e.message
    };
  }
}

function testApiCall() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('IMPORT_API_KEY');

  if (!apiKey) {
    SpreadsheetApp.getUi().alert('Stel eerst de API-sleutel in via het menu.');
    return;
  }

  var result = callApi(apiKey, {
    external_import_id: 'sheet:test:' + new Date().getTime(),
    straatnaam: 'Orkaden',
    huisnummer: '34',
    postcode: '3813',
    woonplaats: 'Amersfoort',
    depthCurve: [
      { depth: 3, ra: 29.10 },
      { depth: 30, ra: 2.00 }
    ]
  });

  SpreadsheetApp.getUi().alert(
    result.ok
      ? '✓ Test OK — id: ' + (result.id || '—') + (result.duplicate ? ' (duplicate)' : '')
      : '✗ Test mislukt: ' + result.error
  );
}

function debugRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.FIRST_DATA_ROW) {
    Logger.log('Geen datarijen gevonden.');
    return;
  }

  var data = sheet.getRange(CONFIG.FIRST_DATA_ROW, 1, lastRow, CONFIG.ID_COL).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowNum = CONFIG.FIRST_DATA_ROW + i;
    var status = String(row[CONFIG.STATUS_COL - 1] || '').trim();
    var depthCurve = buildDepthCurve(row);

    Logger.log(
      'Rij ' + rowNum +
      ' | status="' + status + '"' +
      ' | straat="' + row[0] + '"' +
      ' | lat="' + row[4] + '"' +
      ' | lon="' + row[5] + '"' +
      ' | R_3m="' + row[11] + '"' +
      ' | depthCurve=' + depthCurve.length +
      ' | external_id="' + buildExternalImportId(rowNum, row[2], row[1]) + '"'
    );
  }
}

function clearStatuses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.FIRST_DATA_ROW) return;

  sheet.getRange(CONFIG.FIRST_DATA_ROW, CONFIG.STATUS_COL, lastRow, CONFIG.ID_COL).clearContent();

  Logger.log('Statuskolommen V en W geleegd — rijen worden opnieuw geïmporteerd.');
}

function clearApiKey() {
  PropertiesService.getScriptProperties().deleteProperty('IMPORT_API_KEY');
  Logger.log('API key verwijderd.');
}
