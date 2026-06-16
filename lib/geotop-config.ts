/**
 * GeoTOP OPeNDAP configuration — GeoTOP v1.6.1 (TNO – Geologische Dienst Nederland).
 *
 * All numeric constants that depend on the model version are centralised here so
 * that a new GeoTOP release triggers a single-file update rather than a scattered
 * hunt through the codebase. Run `npm run verify:geotop` after any model update
 * to confirm the live service still matches these values.
 */

export const GEOTOP = {
  // ── Service ──────────────────────────────────────────────────────────────────
  endpoint: 'https://www.dinodata.nl/opendap/hyrax/GeoTOP/geotop.nc',
  version: 'GeoTOP v1.6.1',
  attribution: 'TNO – GDN, BRO GeoTOP v1.6.1',

  // ── Index grid (v1.6.1) ───────────────────────────────────────────────────────
  // x: RD East, y: RD North (EPSG:28992), z: NAP elevation (m)
  xOrigin: 13600,      // RD x of index xi=0
  yOrigin: 338500,     // RD y of index yi=0
  zOriginNAP: -50,     // NAP elevation (m) of z index 0
  xStep: 100,          // m per xi step
  yStep: 100,          // m per yi step
  zStep: 0.5,          // m per z step
  xMax: 2645,          // max valid xi
  yMax: 2810,          // max valid yi
  zMax: 312,           // max valid z index (313 slices, z=0..312 → NAP −50..+106 m)

  // ── Request ───────────────────────────────────────────────────────────────────
  timeoutMs: 12000,
  // kans_4 is not included — lithoklasse 4 is unused in v1.6.1 (always 0%)
  kansVars: [1, 2, 3, 5, 6, 7, 8, 9] as const,

  // ── Lithoklasse codes (0–9) ───────────────────────────────────────────────────
  // Source: kans_* variable long_names in the GeoTOP v1.6.1 DMR.
  klasName: {
    0: 'antropogeen',
    1: 'organisch / veen',
    2: 'klei',
    3: 'kleiig zand / zandige klei / leem',
    4: '(ongebruikt)',
    5: 'fijn zand',
    6: 'matig grof zand',
    7: 'grof zand',
    8: 'grind',
    9: 'schelpen',
  } as Record<number, string>,

  /**
   * Indicative ρ (Ω·m) per GeoTOP lithoklasse — used for the GeoTopResult rho
   * confidence bands only. These are engineering assumptions for Dutch conditions
   * and should be calibrated against field measurements over time.
   *
   * IMPORTANT: These values are NOT used for the BroDepthSample.rho field that
   * feeds the calculator — that uses the 5-class LITHO_CLASS_TO_RHO table so the
   * two-layer model (rhoDry/rhoWet) remains consistent.
   */
  rhoByKlas: {
    0: 100,   // antropogeen — highly variable; conservative mid-range
    1: 20,    // organisch/veen — typically wet and conductive
    2: 30,    // klei
    3: 60,    // kleiig zand / leem
    4: 125,   // unused — sand default
    5: 125,   // fijn zand
    6: 200,   // matig grof zand
    7: 400,   // grof zand
    8: 1000,  // grind
    9: 300,   // schelpen — variable; conservative mid
  } as Record<number, number>,

  /**
   * Saturation factor: applied to rhoByKlas values for voxels below the water
   * table when computing the GeoTopResult rho confidence bands.
   * ρ_wet ≈ ρ_dry × saturationFactor
   */
  saturationFactor: 0.4,

  /**
   * GeoTOP lithoklasse (0–9) → EarthGND lithoClass (1–5).
   * Used to produce BroDepthSample values that are consistent with the two-layer
   * model (LITHO_CLASS_TO_RHO_DRY / _WET in calculations.ts).
   */
  klasToLithoClass: {
    0: 3, // antropogeen → sand (unknown; conservative)
    1: 5, // organisch/veen → peat
    2: 1, // klei → clay
    3: 2, // kleiig zand/leem → loam
    4: 3, // unused → sand
    5: 3, // fijn zand → sand
    6: 3, // matig grof zand → sand
    7: 4, // grof zand → gravel (coarse, high ρ)
    8: 4, // grind → gravel
    9: 3, // schelpen → sand (variable; conservative)
  } as Record<number, number>,
} as const;
