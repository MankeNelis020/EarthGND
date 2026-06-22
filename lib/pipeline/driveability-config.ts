/**
 * REKENMODEL — Maximale indrijfdiepte per grondsoort × drijfmethode (meter).
 *
 * Bron: EarthGND referentietabel (zie screenshot IMG_3201, 2026-06).
 * SDS en Pneumatisch herzien 2026-06 op basis van veldpraktijk: waarden zijn
 * de originele tabelwaarden × 2,30 (verhoging met 130%) na analyse die aantoonde
 * dat de originele typical-waarden 40–130% te laag lagen t.o.v. de praktijk
 * (M4-koppelstukken + 1,5 m verlengstaven SDS; professionele pneumatische hamers).
 * Voorboren-kolom gebaseerd op fabrieksspecificaties (Erico/Kopex, Galmar GD-series).
 *
 * ⚠️  Dit is het ENIGE bestand dat je aanpast als de waarden veranderen.
 *     De rekenlogica in driveability.ts blijft ongewijzigd.
 *
 * Bandbreedte:
 *   low     = ondergrens (ongunstige grond / minimale condities)
 *   typical = gemiddeld bereik in normale werkomstandigheden
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
// SDS en Pneumatisch: originele waarden × 2,30 per grondsoort.
// Handslag en Voorboren: ongewijzigd (menselijk/mechanisch maximum onveranderd).

export const DRIVEABILITY_TABLE: Record<GrndType, Record<DriveMethodKey, ZMaxEntry>> = {
  veen: {
    handslag:    { low: 4,    typical: 6,    high: 8    },
    sds:         { low: 14,   typical: 18,   high: 23   },
    pneumatisch: { low: 23,   typical: 32,   high: 41   },
    voorboren:   { low: 20,   typical: 30,   high: 40   },
  },
  klei: {
    handslag:    { low: 3,    typical: 4.5,  high: 6    },
    sds:         { low: 11.5, typical: 16,   high: 21   },
    pneumatisch: { low: 18,   typical: 28,   high: 37   },
    voorboren:   { low: 20,   typical: 30,   high: 40   },
  },
  leem: {
    handslag:    { low: 3,    typical: 4.5,  high: 6    },
    sds:         { low: 11.5, typical: 15,   high: 18   },
    pneumatisch: { low: 18,   typical: 25,   high: 32   },
    voorboren:   { low: 20,   typical: 30,   high: 40   },
  },
  zand_los: {
    handslag:    { low: 3,    typical: 4.5,  high: 6    },
    sds:         { low: 11.5, typical: 16,   high: 21   },
    pneumatisch: { low: 18,   typical: 26,   high: 35   },
    voorboren:   { low: 20,   typical: 30,   high: 40   },
  },
  zand_vast: {
    handslag:    { low: 2,    typical: 3,    high: 4    },
    sds:         { low: 7,    typical: 10,   high: 14   },
    pneumatisch: { low: 14,   typical: 18,   high: 23   },
    voorboren:   { low: 15,   typical: 25,   high: 35   },
  },
  grind: {
    handslag:    { low: 1,    typical: 1.5,  high: 2,   warning: true },
    sds:         { low: 2.5,  typical: 4.5,  high: 7,   warning: true },
    pneumatisch: { low: 4.5,  typical: 8,    high: 11.5, warning: true },
    voorboren:   { low: 15,   typical: 22,   high: 30   },
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
