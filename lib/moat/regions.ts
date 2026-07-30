/** Named NL boxes — keep in sync with supabase moat_region_for_coords(). */

export function moatRegionForCoords(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat == null || lon == null) return 'onbekend';
  if (lat >= 52.30 && lat <= 52.45 && lon >= 4.75 && lon <= 5.05) return 'Amsterdam';
  if (lat >= 51.85 && lat <= 52.05 && lon >= 4.30 && lon <= 4.65) return 'Rotterdam';
  if (lat >= 52.00 && lat <= 52.18 && lon >= 5.00 && lon <= 5.25) return 'Utrecht';
  if (lat >= 52.05 && lat <= 52.45 && lon >= 5.50 && lon <= 6.20) return 'Veluwe';
  if (lat >= 50.70 && lat <= 51.55 && lon >= 5.50 && lon <= 6.30) return 'Limburg';
  if (lat >= 52.25 && lat <= 52.55 && lon >= 4.45 && lon <= 4.75) return 'Haarlem-IJmond';
  if (lat >= 52.00 && lat <= 52.35 && lon >= 4.55 && lon <= 4.90) return 'Haarlemmermeer';
  if (lat >= 52.45 && lat <= 52.70 && lon >= 5.30 && lon <= 5.70) return 'Flevoland';
  if (lat >= 51.90 && lat <= 52.15 && lon >= 5.00 && lon <= 5.20) return 'Amersfoort';
  if (lat >= 52.05 && lat <= 52.20 && lon >= 4.60 && lon <= 4.80) return 'Boskoop';
  return 'overig-NL';
}
