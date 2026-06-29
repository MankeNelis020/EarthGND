/**
 * Google Apps Script — ontvang bevestigde veldmetingen van EarthGND.
 *
 * Deploy als Web App (POST, Anyone).
 * Zet GOOGLE_SHEETS_WEBHOOK_URL in Vercel op de deployment URL.
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Veldmetingen_sync')
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Veldmetingen_sync');

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'timestamp', 'event', 'meting_id', 'calculation_id',
        'postcode', 'huisnummer', 'straat', 'woonplaats',
        'lat', 'lon', 'installed_depth', 'achieved_ra',
        'field_gw_depth', 'bro_litho_class', 'depth_curve', 'source_type', 'quality',
      ]);
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.event || '',
      data.meting_id || '',
      data.calculation_id || '',
      data.postcode || '',
      data.huisnummer || '',
      data.straatnaam || '',
      data.woonplaats || '',
      data.lat || '',
      data.lon || '',
      data.installed_depth || '',
      data.achieved_ra || '',
      data.field_gw_depth || '',
      data.bro_litho_class || '',
      data.depth_curve || '',
      data.source_type || '',
      data.measurement_quality || '',
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
