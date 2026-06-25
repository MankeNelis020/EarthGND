/**
 * Hardcoded field measurement data from the PDF dataset snapshot.
 *
 * SOURCE: EarthGND-veldmetingen.xlsx (PDF export, 4 locations).
 * TODO: Replace placeholder R(L) values with exact numbers from the Excel file.
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
    label: 'Boskoop (veen/klei)',
    address: 'Rijneveld 153, Boskoop',
    groundwaterDepthM: 0.3,
    soilDescription: 'veen bovenlaag, klei daarna — typisch West-NL polderprofiel',
    // R(L) approximate from PDF (ρ_eff ≈ 10–12 Ω·m measured).
    // TODO: replace with exact values from EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 3.98 },
      { depthM: 6,  rMeasured: 2.08 },
      { depthM: 9,  rMeasured: 1.44 },
      { depthM: 12, rMeasured: 1.11 },
    ],
  },
  {
    id: 'haarlem',
    label: 'Haarlem (klei)',
    address: 'Haarlem centrum',
    groundwaterDepthM: 1.5,
    soilDescription: 'klei, strandvlakte-afzetting, typisch Kennemerland',
    // R(L) approximate from PDF (ρ_eff ≈ 17–20 Ω·m measured).
    // TODO: replace with exact values from EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 10.52 },
      { depthM: 6,  rMeasured: 4.40 },
      { depthM: 9,  rMeasured: 2.87 },
      { depthM: 12, rMeasured: 2.15 },
    ],
  },
  {
    id: 'ijmuiden',
    label: 'IJmuiden (kleiig zand)',
    address: 'IJmuiden havengebied',
    groundwaterDepthM: 2.0,
    soilDescription: 'kleiig zand / lemig zand — strandafzetting bij kust',
    // R(L) approximate from PDF (ρ_eff ≈ 43–91 Ω·m, variabel per diepte).
    // TODO: replace with exact values from EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 46.0 },
      { depthM: 6,  rMeasured: 16.2 },
      { depthM: 9,  rMeasured: 10.1 },
      { depthM: 12, rMeasured: 7.47 },
    ],
  },
  {
    id: 'haarlemmermeer',
    label: 'Haarlemmermeer (veen/klei)',
    address: 'Hoofddorp, Haarlemmermeer',
    groundwaterDepthM: 0.6,
    soilDescription: 'veen/klei polder — drooggemalen, GHG ondiep',
    // R(L) approximate from PDF (ρ_eff ≈ 10–16 Ω·m measured).
    // TODO: replace with exact values from EarthGND-veldmetingen.xlsx
    depthCurve: [
      { depthM: 3,  rMeasured: 5.30 },
      { depthM: 6,  rMeasured: 2.61 },
      { depthM: 9,  rMeasured: 1.78 },
      { depthM: 12, rMeasured: 1.36 },
    ],
  },
];
