/**
 * Google Apps Script — import rijen uit spreadsheet naar EarthGND Supabase.
 *
 * Setup:
 *   1. Plak in Extensions → Apps Script
 *   2. Script Properties: IMPORT_API_KEY = <jouw key>
 *   3. Pas EARTHGND_IMPORT_URL aan
 *   4. Menu: importSelectedRows() op geselecteerde rijen
 */

const EARTHGND_IMPORT_URL = 'https://earthgnd.com/api/admin/import-meting';

function importSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();
  const startRow = range.getRow();
  const numRows = range.getNumRows();
  const apiKey = PropertiesService.getScriptProperties().getProperty('IMPORT_API_KEY');
  if (!apiKey) throw new Error('Zet IMPORT_API_KEY in Script Properties');

  for (let i = 0; i < numRows; i++) {
    const row = startRow + i;
    if (row === 1) continue; // header
    importRow_(sheet, row, apiKey);
  }
}

function importRow_(sheet, row, apiKey) {
  const v = (col) => sheet.getRange(row, col).getValue();

  const externalId = String(v(1) || row);
  const depthJson = String(v(12) || '[]');
  let depthCurve;
  try {
    depthCurve = JSON.parse(depthJson);
  } catch (e) {
    Logger.log('Rij ' + row + ': invalid JSON in depth_curve');
    return;
  }

  const payload = {
    external_import_id: externalId,
    straatnaam:         v(2) || undefined,
    huisnummer:         v(3) ? String(v(3)) : undefined,
    postcode:           v(4) ? String(v(4)) : undefined,
    woonplaats:         v(5) || undefined,
    lat:                v(6) ? Number(v(6)) : undefined,
    lon:                v(7) ? Number(v(7)) : undefined,
    field_gw_depth:     v(8) ? Number(v(8)) : undefined,
    bro_litho_class:    v(9) ? Number(v(9)) : undefined,
    bro_gw_depth:       v(10) ? Number(v(10)) : undefined,
    measurement_quality: v(11) ? String(v(11)) : 'goed',
    depthCurve:         depthCurve,
    notes:              v(13) ? String(v(13)) : undefined,
  };

  const res = UrlFetchApp.fetch(EARTHGND_IMPORT_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-import-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  Logger.log('Rij ' + row + ': HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
  sheet.getRange(row, 14).setValue(res.getResponseCode() === 200 ? 'OK' : res.getContentText());
}
