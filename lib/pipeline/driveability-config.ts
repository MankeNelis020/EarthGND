/**
 * REKENMODEL — Maximale indrijfdiepte per grondsoort × drijfmethode (meter).
 *
 * Bron: EarthGND referentietabel (zie screenshot IMG_3201, 2026-06).
 * SDS en Pneumatisch herzien 2026-06 op basis van veldpraktijk (M4-koppelstukken
 * + 1,5 m verlengstaven): SDS haalt routinematig 12–15 m in los zand; pneumatisch
 * 18–25 m. De eerdere typical-waarden onderschatten de praktische diepte met 40–130%.
 * Voorboren-kolom gebaseerd op fabrieksspecificaties (Erico/Kopex, Galmar GD-series).
 *
 * ⚠️  Dit is het ENIGE bestand dat je aanpast als de waarden veranderen.
 *     De rekenlogica in driveability.ts blijft ongewijzigd.
 *
 * Bandbreedte:
 *   low     = ondergrens (ongunstige grond / menselijk maximum)
 *   typical = gemiddeld bereik in goede werkomstandigheden
 *   high    = bovengrens (gunstige grond / optimale condities + verlengstaven)
 *
 * Grondsoort-codes (GrndType):
 *   veen            → zachte organische laag
 *   klei            → cohesieve kleilaag
 *   leem            → zandhoudende klei / zandige leem
 *   zand_los        → los, niet-verdicht zand
 *   zand_vast       → verdicht / gepakt zand
 *   grind           → grind/gravel — ⚠️ moeilijk, beperkte diepte
 *   keien_rots      → keien, rots, puin — harde weigering
 *
 * Mapping naar EarthGND lithoClass (1–5):
 *   1 = klei        → klei
 *   2 = leem        → leem
 *   3 = zand        → zand_los  (conservatief; zand_vast als BRO q_c > 15 MPa)
 *   4 = grind       → grind
 *   5 = veen        → veen
 *   6 = rots/keien  → keien_rots (GeoTOP of handmatige selectie)
 */

export type GrndType =
  | 'veen'
  | 'klei'
  | 'leem'
  | 'zand_los'
  | 'zand_vast'
  | 'grind'
  | 'keien_rots';

export type DriveMethodKey = 'handslag' | 'sds' | 'pneumatisch' | 'voorboren';

export interface ZMaxEntry {
  low:     number;   // m
  typical: number;   // m
  high:    number;   // m
  /** true = bereikbaar met waarschuwing (voorzichtig, controleer tussentijds) */
  warning?: boolean;
  /** true = harde weigering; pen kan niet worden geplaatst met deze methode */
  refusal?: boolean;
}

// ─── Referentietabel ──────────────────────────────────────────────────────────

export const DRIVEABILITY_TABLE: Record<GrndType, Record<DriveMethodKey, ZMaxEntry>> = {
  veen: {
    handslag:    { low: 4,  typical: 6,    high: 8   },
    sds:         { low: 7,  typical: 13,   high: 18  },
    pneumatisch: { low: 12, typical: 20,   high: 28  },
    voorboren:   { low: 20, typical: 30,   high: 40  },
  },
  klei: {
    handslag:    { low: 3,  typical: 4.5,  high: 6   },
    sds:         { low: 6,  typical: 10,   high: 14  },
    pneumatisch: { low: 10, typical: 16,   high: 22  },
    voorboren:   { low: 20, typical: 30,   high: 40  },
  },
  leem: {
    handslag:    { low: 3,  typical: 4.5,  high: 6   },
    sds:         { low: 5,  typical: 9,    high: 12  },
    pneumatisch: { low: 10, typical: 14,   high: 20  },
    voorboren:   { low: 20, typical: 30,   high: 40  },
  },
  zand_los: {
    handslag:    { low: 3,  typical: 4.5,  high: 6   },
    sds:         { low: 6,  typical: 12,   high: 15  },
    pneumatisch: { low: 10, typical: 18,   high: 25  },
    voorboren:   { low: 20, typical: 30,   high: 40  },
  },
  zand_vast: {
    handslag:    { low: 2,  typical: 3,    high: 4   },
    sds:         { low: 4,  typical: 6,    high: 9   },
    pneumatisch: { low: 8,  typical: 12,   high: 16  },
    voorboren:   { low: 15, typical: 25,   high: 35  },
  },
  grind: {
    handslag:    { low: 1,  typical: 1.5,  high: 2,  warning: true },
    sds:         { low: 1,  typical: 2.5,  high: 4,  warning: true },
    pneumatisch: { low: 2,  typical: 4,    high: 6,  warning: true },
    voorboren:   { low: 15, typical: 22,   high: 30  },
  },
  keien_rots: {
    handslag:    { low: 0, typical: 0, high: 0, refusal: true },
    sds:         { low: 0, typical: 0, high: 0, refusal: true },
    pneumatisch: { low: 0, typical: 0, high: 0, refusal: true },
    voorboren:   { low: 8, typical: 15, high: 25 },
  },
};

// ─── Mapping EarthGND lithoClass (1–5) → GrndType ────────────────────────────
// Conservatieve mapping; gebruik zand_vast wanneer BRO CPT q_c > 15 MPa.

export const LITHO_CLASS_TO_GRND: Record<number, GrndType> = {
  1: 'klei',
  2: 'leem',
  3: 'zand_los',  // conservatief — meest voorkomend in NL
  4: 'grind',
  5: 'veen',
  6: 'keien_rots',
};

// ─── Helper: haal entry op (fallback naar zand_los) ───────────────────────────

export function getDriveEntry(grnd: GrndType, method: DriveMethodKey): ZMaxEntry {
  return DRIVEABILITY_TABLE[grnd]?.[method] ?? DRIVEABILITY_TABLE['zand_los'][method];
}
