/**
 * Google Sheets sync — veldmetingen naar spreadsheet (Apps Script webhook).
 *
 * GOOGLE_SHEETS_WEBHOOK_URL moet een Apps Script Web App URL zijn die
 * POST JSON accepteert en rijen toevoegt aan de veldmetingen-sheet.
 */

export interface SheetMetingPayload {
  event:              'veldmeting_confirmed' | 'veldmeting_imported';
  timestamp:          string;
  meting_id:          string;
  calculation_id:     string | null;
  postcode:           string | null;
  huisnummer:         string | null;
  straatnaam:         string | null;
  woonplaats:         string | null;
  lat:                number | null;
  lon:                number | null;
  installed_depth:    number | null;
  achieved_ra:        number | null;
  field_gw_depth:     number | null;
  bro_litho_class:    number | null;
  depth_curve:        string; // JSON string voor sheet-cel
  source_type:        string | null;
  measurement_quality: string | null;
}

export async function pushMetingToGoogleSheet(payload: SheetMetingPayload): Promise<boolean> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (e) {
    console.error('[sheet-sync]', e);
    return false;
  }
}

/** Of empirische kennis actief is in berekeningen (L2/L3/L4). */
export function isSoilKnowledgeActive(): boolean {
  return process.env.SOIL_KNOWLEDGE_ACTIVE === 'true';
}
