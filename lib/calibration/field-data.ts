/**
 * Hardcoded field measurement data — exact values from EarthGND-veldmetingen.xlsx.
 *
 * SOURCE: EarthGND-veldmetingen.xlsx (5 locations, updated 2026-06-26).
 *
 * R(L) curves use rod diameter d=0.014 m throughout (consistent with kernel).
 * ρ_apparent = R × 2πL / ln(4L/d) — NO −1 term (code formula, not PDF section B).
 * The PDF section B uses ρ = R × 2πL / (ln(4L/a)−1) with a=0.007 m; this ~14%
 * formula difference will appear as a systematic residual — intentionally captured
 * by calibration rather than by patching the kernel formula.
 *
 * GWT depths are on-site observations from the monteur form.
 */

import type { FieldLocation } from './types';

export const FIELD_LOCATIONS: FieldLocation[] = [
  {
    id: 'boskoop',
    label: 'Boskoop – Paddegat 3 (veen/klei)',
    address: 'Paddegat 3, Boskoop',
    groundwaterDepthM: 0.3,
    soilDescription: 'veen/klei — NL laagveen, GHG ondiep (Groene Hart)',
    // Gemiddelde van 2 pennen — exacte waarden uit EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3, rMeasured: 3.445 },
      { depthM: 6, rMeasured: 1.885 },
    ],
  },
  {
    id: 'ijmuiden',
    label: 'IJmuiden – Trawlerkade 4 (kleiig zand)',
    address: 'Trawlerkade 4, 1976 CB IJmuiden',
    groundwaterDepthM: 2.0,
    soilDescription: 'kleiig zand / lemig zand — strandafzetting havengebied',
    // Gemiddelde van 2 pennen — exacte waarden uit EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 31.015 },
      { depthM: 6,  rMeasured: 9.26 },
      { depthM: 9,  rMeasured: 7.165 },
      { depthM: 12, rMeasured: 5.34 },
      { depthM: 15, rMeasured: 4.51 },
      { depthM: 18, rMeasured: 3.845 },
      { depthM: 21, rMeasured: 3.245 },
      { depthM: 24, rMeasured: 2.88 },
      { depthM: 27, rMeasured: 2.20 },
      { depthM: 30, rMeasured: 1.97 },
    ],
  },
  {
    id: 'haarlem',
    label: 'Haarlem – Schipholpoort 2 (klei)',
    address: 'Schipholpoort 2, Haarlem',
    groundwaterDepthM: 1.5,
    soilDescription: 'klei ~20 Ω·m — strandvlakte-afzetting Kennemerland',
    // 1 pen — "9m doorgehaald" in Excel maar waarde aanwezig; opgenomen.
    // Exacte waarden uit EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 6.82 },
      { depthM: 6,  rMeasured: 3.77 },
      { depthM: 9,  rMeasured: 2.65 },
      { depthM: 12, rMeasured: 1.76 },
    ],
  },
  {
    id: 'haarlemmermeer',
    label: 'Haarlemmermeer (veen/klei polder)',
    address: '52°13\'52.6"N 4°37\'45.5"E, Haarlemmermeer',
    coords: { lat: 52.2313, lon: 4.6293 },
    groundwaterDepthM: 0.6,
    soilDescription: 'veen/klei polder — drooggemalen, GHG ondiep',
    // 1 pen — GPS-locatie, geen straatnaam. Exacte waarden uit EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3, rMeasured: 5.43 },
      { depthM: 6, rMeasured: 1.92 },
      { depthM: 9, rMeasured: 1.42 },
    ],
  },
  {
    id: 'amersfoort',
    label: 'Amersfoort – Orkaden 34 (zand)',
    address: 'Orkaden 34, Amersfoort',
    groundwaterDepthM: 2.5,
    soilDescription: 'zand/matig-ρ — ~43-85 Ω·m, diep stabiel rond 43 Ω·m',
    // 1 pen — NIEUWE LOCATIE. gwDepth=2.5 m is schatting (postcode opzoeken).
    // Exacte waarden uit EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 29.1 },
      { depthM: 6,  rMeasured: 9.35 },
      { depthM: 9,  rMeasured: 6.72 },
      { depthM: 12, rMeasured: 4.45 },
      { depthM: 15, rMeasured: 3.8 },
      { depthM: 18, rMeasured: 2.86 },
      { depthM: 21, rMeasured: 2.63 },
      { depthM: 24, rMeasured: 2.48 },
      { depthM: 27, rMeasured: 2.19 },
      { depthM: 30, rMeasured: 2.0 },
    ],
  },
];
