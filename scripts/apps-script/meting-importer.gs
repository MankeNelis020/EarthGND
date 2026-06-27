/**
 * EarthGND Meting Importer — Google Apps Script
 *
 * Installatiehandleiding:
 *   1. Open het Google Sheet met metingen
 *   2. Uitbreidingen > Apps Script > plak deze code
 *   3. Sla op en ververs het sheet → menu "EarthGND" verschijnt
 *   4. EarthGND > Stel API-sleutel in → voer IMPORT_API_KEY in (uit Vercel env vars)
 *   5. EarthGND > Activeer automatisch importeren → installeert de 5-minuten trigger
 *
 * Spreadsheet-indeling (rij 1 = headers, exact deze namen):
 *   A: straatnaam       B: huisnummer     C: postcode        D: woonplaats
 *   E: lat              F: lon            G: field_gw_depth  H: bro_litho_class
 *   I: bro_gw_depth     J: measurement_quality              K: notes
 *   L: R_3m  M: R_6m  N: R_9m  O: R_12m  P: R_15m  Q: R_18m
 *   R: R_21m S: R_24m T: R_27m U: R_30m
 *   V: _status (door script ingevuld — niet handmatig bewerken)
 *   W: _supabase_id (door script ingevuld)
 *
 * Kolommen E/F (lat/lon) zijn optioneel als adres bekend is — script geocodeert via PDOK.
 * measurement_quality: goed | twijfelachtig | onbruikbaar (standaard: goed)
 */

// ─── Configuratie ─────────────────────────────────────────────────────────────

var CONFIG = {
  API_URL:    'https://earthgnd.com/api/admin/import-meting',
  SHEET_NAME: 'Metingen',
  FIRST_DATA_ROW: 2,
  STATUS_COL: 22,      // kolom V (1-based)
  ID_COL:     23,      // kolom W
};

var DEPTH_STEPS = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

// ─── Menu ─────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EarthGND')
    .addItem('Nu importeren', 'importNewRows')
    .addSeparator()
    .addItem('Activeer automatisch importeren (elke 5 min)', 'installTrigger')
    .addItem('Verwijder automatische trigger', 'removeTrigger')
    .addSeparator()
    .addItem('Stel API-sleutel in', 'promptApiKey')
    .addToUi();
}

// ─── API-sleutel opslaan ──────────────────────────────────────────────────────

function promptApiKey() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'EarthGND API-sleutel',
    'Voer de IMPORT_API_KEY in (te vinden in Vercel → Settings → Environment Variables):',
    ui.ButtonSet.OK_CANCEL,
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty('IMPORT_API_KEY', result.getResponseText().trim());
    ui.alert('✓ API-sleutel opgeslagen. Sleutel wordt veilig bewaard in Apps Script properties.');
  }
}

// ─── Trigger installeren / verwijderen ────────────────────────────────────────

function installTrigger() {
  removeTrigger(); // verwijder eventuele dubbele trigger eerst
  ScriptApp.newTrigger('importNewRows')
    .timeBased()
    .everyMinutes(5)
    .create();
  SpreadsheetApp.getUi().alert('✓ Automatisch importeren actief (elke 5 minuten).');
}

function removeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'importNewRows'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
}

// ─── Hoofd-importfunctie ──────────────────────────────────────────────────────

function importNewRows() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('IMPORT_API_KEY');
  if (!apiKey) {
    Logger.log('Geen API-sleutel geconfigureerd. Gebruik EarthGND > Stel API-sleutel in.');
    return;
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log('Sheet "' + CONFIG.SHEET_NAME + '" niet gevonden.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.FIRST_DATA_ROW) return;

  var numRows = lastRow - CONFIG.FIRST_DATA_ROW + 1;
  var data    = sheet.getRange(CONFIG.FIRST_DATA_ROW, 1, numRows, CONFIG.ID_COL).getValues();

  var imported = 0;
  var errors   = 0;

  for (var i = 0; i < data.length; i++) {
    var row    = data[i];
    var status = String(row[CONFIG.STATUS_COL - 1] || '').trim();

    // Sla over als al verwerkt (status begint met ✓ of ✗)
    if (status.indexOf('✓') === 0 || status.indexOf('✗') === 0) continue;

    // Sla over als rij leeg is (geen straatnaam en geen lat)
    var straatnaam = String(row[0] || '').trim();
    var lat        = row[4];
    if (!straatnaam && (lat === '' || lat === null || isNaN(lat))) continue;

    // Bouw dieptecurve op uit R_Xm kolommen (kolommen L–U = indices 11–20)
    var depthCurve = [];
    for (var d = 0; d < DEPTH_STEPS.length; d++) {
      var r = row[11 + d];
      if (r !== '' && r !== null && !isNaN(Number(r)) && Number(r) > 0) {
        depthCurve.push({ depth: DEPTH_STEPS[d], ra: Number(r) });
      }
    }

    if (depthCurve.length === 0) continue; // geen meetpunten — sla over

    var record = {
      straatnaam:          straatnaam             || null,
      huisnummer:          String(row[1] || '')   || null,
      postcode:            String(row[2] || '')   || null,
      woonplaats:          String(row[3] || '')   || null,
      lat:                 (row[4] !== '' && !isNaN(Number(row[4]))) ? Number(row[4]) : null,
      lon:                 (row[5] !== '' && !isNaN(Number(row[5]))) ? Number(row[5]) : null,
      field_gw_depth:      (row[6] !== '' && !isNaN(Number(row[6]))) ? Number(row[6]) : null,
      bro_litho_class:     (row[7] !== '' && !isNaN(Number(row[7]))) ? Number(row[7]) : null,
      bro_gw_depth:        (row[8] !== '' && !isNaN(Number(row[8]))) ? Number(row[8]) : null,
      measurement_quality: String(row[9] || 'goed').trim() || 'goed',
      notes:               String(row[10] || '') || null,
      depthCurve:          depthCurve,
    };

    var rowNum = CONFIG.FIRST_DATA_ROW + i;
    var result = callApi(apiKey, record);

    if (result.ok) {
      sheet.getRange(rowNum, CONFIG.STATUS_COL).setValue('✓ geïmporteerd');
      sheet.getRange(rowNum, CONFIG.ID_COL).setValue(result.id || '');
      imported++;
    } else {
      sheet.getRange(rowNum, CONFIG.STATUS_COL).setValue('✗ fout: ' + result.error);
      errors++;
    }

    // Kleine pauze om rate limits te vermijden
    Utilities.sleep(300);
  }

  Logger.log('Klaar: ' + imported + ' geïmporteerd, ' + errors + ' fouten.');
}

// ─── API-aanroep ──────────────────────────────────────────────────────────────

function callApi(apiKey, record) {
  try {
    var response = UrlFetchApp.fetch(CONFIG.API_URL, {
      method:           'post',
      contentType:      'application/json',
      headers:          { 'x-import-key': apiKey },
      payload:          JSON.stringify(record),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    var body;
    try {
      body = JSON.parse(response.getContentText());
    } catch (e) {
      body = { error: 'Ongeldige serverrespons (HTTP ' + code + ')' };
    }

    if (code === 200 && body.ok) {
      return { ok: true, id: body.id };
    }
    return { ok: false, error: body.error || 'HTTP ' + code };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
