/**
 * Public sandbox fixtures — static dummy data only.
 * No BRO calls, no credits, no DB writes.
 *
 * Shaped to mirror DiepteCalculator results + MonteurForm + OpleverrapportView.
 */

export type SandboxCityId =
  | 'amsterdam'
  | 'rotterdam'
  | 'utrecht'
  | 'eindhoven'
  | 'arnhem';

export type SandboxSoilSample = {
  depthM: number;
  classLabel: string;
  rho: number;
};

export type SandboxCityFixture = {
  id: SandboxCityId;
  name: string;
  province: string;
  soilHint: string;
  valueNote: string;
  /** Demo BRO-like soil panel (read-only) */
  soil: {
    riskClass: 'I' | 'II' | 'III' | 'IV';
    riskLabel: string;
    riskDescription: string;
    samples: SandboxSoilSample[];
    rhoDry: number;
    rhoWet: number;
    effectiveRho: number;
    diameterLabel: string;
    driveMethodUi: string;
    targetCategoryLabel: string;
  };
  calc: {
    id: string;
    postcode: string;
    rapport_naam: string;
    created_at: string;
    result: { dimension: number; achievedResistance: number };
    input_values: {
      electrodeType: 'pen';
      targetResistance: number;
      rho: number;
      groundwaterDepth: number;
      drijfmethode: string;
    };
  };
  meting: {
    id: string;
    status: 'confirmed';
    monteur_email: string;
    lat: number;
    lon: number;
    gps_accuracy_m: number;
    postcode: string;
    straatnaam: string;
    huisnummer: string;
    woonplaats: string;
    depth_curve: { depth: number; ra: number }[];
    achieved_ra: number;
    installed_depth: number;
    electrode_type: 'pen';
    drijfmethode: string;
    rods: { rod_number: number; installed_depth: number; achieved_ra: number }[] | null;
    aantal_pennen: number;
    notes: string;
    submitted_at: string;
    confirmed_at: string;
  };
};

function curve(points: Array<[number, number]>): { depth: number; ra: number }[] {
  return points.map(([depth, ra]) => ({ depth, ra }));
}

export const SANDBOX_CITIES: SandboxCityFixture[] = [
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    province: 'Noord-Holland',
    soilHint: 'Kleibodem · relatief lage ρ',
    valueNote: 'Typisch: snellere diepte-inschatting + opleverdossier zonder handmatige tabellen.',
    soil: {
      riskClass: 'I',
      riskLabel: 'Klasse I — Laag risico',
      riskDescription: 'Zeer geleidende klei — aarding meestal eenvoudig haalbaar.',
      samples: [
        { depthM: 1, classLabel: 'klei', rho: 35 },
        { depthM: 3, classLabel: 'klei', rho: 28 },
        { depthM: 6, classLabel: 'klei', rho: 22 },
        { depthM: 10, classLabel: 'klei', rho: 20 },
      ],
      rhoDry: 40,
      rhoWet: 22,
      effectiveRho: 28,
      diameterLabel: 'Standaard grondpen (5/8″) — 14 mm',
      driveMethodUi: 'SDS-breekhamer',
      targetCategoryLabel: 'Overig · utiliteit ≤ 1,8 Ω',
    },
    calc: {
      id: 'sandbox-ams-calc-0001',
      postcode: '1012 AB',
      rapport_naam: 'Demo — Damrak (Amsterdam)',
      created_at: '2026-06-12T09:15:00.000Z',
      result: { dimension: 4.8, achievedResistance: 1.42 },
      input_values: {
        electrodeType: 'pen',
        targetResistance: 1.8,
        rho: 28,
        groundwaterDepth: 1.4,
        drijfmethode: 'handhamer',
      },
    },
    meting: {
      id: 'sandbox-ams-met-0001',
      status: 'confirmed',
      monteur_email: 'demo@earthgnd.example',
      lat: 52.3731,
      lon: 4.8922,
      gps_accuracy_m: 6,
      postcode: '1012 AB',
      straatnaam: 'Damrak',
      huisnummer: '1',
      woonplaats: 'Amsterdam',
      // 1,5 m per pen × 2 = meet elke 3 m; stop bij eerste Ra ≤ doel
      depth_curve: curve([[3, 2.6], [6, 1.45]]),
      achieved_ra: 1.45,
      installed_depth: 6,
      electrode_type: 'pen',
      drijfmethode: 'handhamer',
      rods: null,
      aantal_pennen: 1,
      notes: 'DEMO — geen echte veldmeting. Kleilaag nat vanaf ~1,4 m.',
      submitted_at: '2026-06-12T14:20:00.000Z',
      confirmed_at: '2026-06-12T15:05:00.000Z',
    },
  },
  {
    id: 'rotterdam',
    name: 'Rotterdam',
    province: 'Zuid-Holland',
    soilHint: 'Klei / veenmengsel · diepere pen vaak nodig',
    valueNote: 'ROI: minder retourritten door realistischere diepteverwachting op natte bodems.',
    soil: {
      riskClass: 'I',
      riskLabel: 'Klasse I — Laag risico',
      riskDescription: 'Natte klei/veen — lage ρ, diepere installatie door zachte lagen.',
      samples: [
        { depthM: 1, classLabel: 'veen', rho: 55 },
        { depthM: 3, classLabel: 'klei', rho: 38 },
        { depthM: 6, classLabel: 'klei', rho: 30 },
        { depthM: 12, classLabel: 'klei', rho: 26 },
      ],
      rhoDry: 55,
      rhoWet: 30,
      effectiveRho: 42,
      diameterLabel: 'Standaard grondpen (5/8″) — 14 mm',
      driveMethodUi: 'Pneumatisch',
      targetCategoryLabel: 'Overig · utiliteit ≤ 1,8 Ω',
    },
    calc: {
      id: 'sandbox-rtm-calc-0001',
      postcode: '3011 AD',
      rapport_naam: 'Demo — Coolsingel (Rotterdam)',
      created_at: '2026-06-18T10:00:00.000Z',
      result: { dimension: 6.2, achievedResistance: 1.55 },
      input_values: {
        electrodeType: 'pen',
        targetResistance: 1.8,
        rho: 42,
        groundwaterDepth: 1.1,
        drijfmethode: 'elektrisch',
      },
    },
    meting: {
      id: 'sandbox-rtm-met-0001',
      status: 'confirmed',
      monteur_email: 'demo@earthgnd.example',
      lat: 51.9225,
      lon: 4.4792,
      gps_accuracy_m: 8,
      postcode: '3011 AD',
      straatnaam: 'Coolsingel',
      huisnummer: '40',
      woonplaats: 'Rotterdam',
      depth_curve: curve([[3, 4.2], [6, 2.9], [9, 1.58]]),
      achieved_ra: 1.58,
      installed_depth: 9,
      electrode_type: 'pen',
      drijfmethode: 'elektrisch',
      rods: null,
      aantal_pennen: 1,
      notes: 'DEMO — geen echte veldmeting. Natte veeninvloed, diepere installatie.',
      submitted_at: '2026-06-18T13:40:00.000Z',
      confirmed_at: '2026-06-18T16:10:00.000Z',
    },
  },
  {
    id: 'utrecht',
    name: 'Utrecht',
    province: 'Utrecht',
    soilHint: 'Zand / klei overgang · gemiddelde ρ',
    valueNote: 'Voorbeeld van berekend vs gemeten in één opleverrapport — klaar voor dossier.',
    soil: {
      riskClass: 'II',
      riskLabel: 'Klasse II — Gemiddeld risico',
      riskDescription: 'Zand/klei-overgang — standaard pendiepte, controleer GWT.',
      samples: [
        { depthM: 1, classLabel: 'zand', rho: 80 },
        { depthM: 3, classLabel: 'zand', rho: 60 },
        { depthM: 6, classLabel: 'klei', rho: 40 },
        { depthM: 10, classLabel: 'klei', rho: 35 },
      ],
      rhoDry: 80,
      rhoWet: 40,
      effectiveRho: 55,
      diameterLabel: 'Standaard grondpen (5/8″) — 14 mm',
      driveMethodUi: 'SDS-breekhamer',
      targetCategoryLabel: 'Overig · utiliteit ≤ 1,8 Ω',
    },
    calc: {
      id: 'sandbox-utr-calc-0001',
      postcode: '3511 CE',
      rapport_naam: 'Demo — Domplein (Utrecht)',
      created_at: '2026-07-02T08:30:00.000Z',
      result: { dimension: 5.1, achievedResistance: 1.38 },
      input_values: {
        electrodeType: 'pen',
        targetResistance: 1.8,
        rho: 55,
        groundwaterDepth: 2.0,
        drijfmethode: 'handhamer',
      },
    },
    meting: {
      id: 'sandbox-utr-met-0001',
      status: 'confirmed',
      monteur_email: 'demo@earthgnd.example',
      lat: 52.0907,
      lon: 5.1214,
      gps_accuracy_m: 5,
      postcode: '3511 CE',
      straatnaam: 'Domplein',
      huisnummer: '9',
      woonplaats: 'Utrecht',
      depth_curve: curve([[3, 3.3], [6, 1.4]]),
      achieved_ra: 1.4,
      installed_depth: 6,
      electrode_type: 'pen',
      drijfmethode: 'handhamer',
      rods: null,
      aantal_pennen: 1,
      notes: 'DEMO — geen echte veldmeting. Doelweerstand gehaald in één poging.',
      submitted_at: '2026-07-02T11:15:00.000Z',
      confirmed_at: '2026-07-02T12:00:00.000Z',
    },
  },
  {
    id: 'eindhoven',
    name: 'Eindhoven',
    province: 'Noord-Brabant',
    soilHint: 'Zandbodem · hogere ρ, soms parallelpen',
    valueNote: 'Laat zien wanneer één pen niet genoeg is — demo met 2 pennen.',
    soil: {
      riskClass: 'III',
      riskLabel: 'Klasse III — Verhoogd risico',
      riskDescription: 'Droog zand — hogere ρ; parallelpennen of diepere installatie vaak nodig.',
      samples: [
        { depthM: 1, classLabel: 'zand', rho: 140 },
        { depthM: 3, classLabel: 'zand', rho: 110 },
        { depthM: 6, classLabel: 'zand', rho: 90 },
        { depthM: 12, classLabel: 'zand', rho: 75 },
      ],
      rhoDry: 140,
      rhoWet: 75,
      effectiveRho: 95,
      diameterLabel: 'Standaard grondpen (5/8″) — 14 mm',
      driveMethodUi: 'Pneumatisch',
      targetCategoryLabel: 'Overig · utiliteit ≤ 1,8 Ω',
    },
    calc: {
      id: 'sandbox-ein-calc-0001',
      postcode: '5611 AZ',
      rapport_naam: 'Demo — Stationsplein (Eindhoven)',
      created_at: '2026-07-08T09:45:00.000Z',
      result: { dimension: 7.0, achievedResistance: 2.4 },
      input_values: {
        electrodeType: 'pen',
        targetResistance: 1.8,
        rho: 95,
        groundwaterDepth: 3.2,
        drijfmethode: 'elektrisch',
      },
    },
    meting: {
      id: 'sandbox-ein-met-0001',
      status: 'confirmed',
      monteur_email: 'demo@earthgnd.example',
      lat: 51.4436,
      lon: 5.4795,
      gps_accuracy_m: 7,
      postcode: '5611 AZ',
      straatnaam: 'Stationsplein',
      huisnummer: '22',
      woonplaats: 'Eindhoven',
      depth_curve: curve([[3, 8.5], [6, 4.4], [9, 2.45]]),
      achieved_ra: 1.72,
      installed_depth: 9,
      electrode_type: 'pen',
      drijfmethode: 'elektrisch',
      rods: [
        { rod_number: 1, installed_depth: 9.0, achieved_ra: 2.45 },
        { rod_number: 2, installed_depth: 9.0, achieved_ra: 2.6 },
      ],
      aantal_pennen: 2,
      notes: 'DEMO — geen echte veldmeting. Parallel 2 pennen op 9 m (3×3 m stappen) → gecombineerde Ra onder doel.',
      submitted_at: '2026-07-08T14:00:00.000Z',
      confirmed_at: '2026-07-08T15:30:00.000Z',
    },
  },
  {
    id: 'arnhem',
    name: 'Arnhem',
    province: 'Gelderland',
    soilHint: 'Zand / grind · drogere bovenlaag',
    valueNote: 'Duidelijk verschil berekend vs gemeten — typisch oplevermoment voor de klant.',
    soil: {
      riskClass: 'II',
      riskLabel: 'Klasse II — Gemiddeld risico',
      riskDescription: 'Zand met drogere bovenlaag — snelle Ra-daling onder GWT.',
      samples: [
        { depthM: 1, classLabel: 'zand', rho: 100 },
        { depthM: 3, classLabel: 'zand', rho: 75 },
        { depthM: 6, classLabel: 'zand', rho: 55 },
        { depthM: 10, classLabel: 'grind', rho: 90 },
      ],
      rhoDry: 100,
      rhoWet: 55,
      effectiveRho: 70,
      diameterLabel: 'Standaard grondpen (5/8″) — 14 mm',
      driveMethodUi: 'SDS-breekhamer',
      targetCategoryLabel: 'Overig · utiliteit ≤ 1,8 Ω',
    },
    calc: {
      id: 'sandbox-arn-calc-0001',
      postcode: '6811 EG',
      rapport_naam: 'Demo — Jansbuitensingel (Arnhem)',
      created_at: '2026-07-15T07:50:00.000Z',
      result: { dimension: 5.6, achievedResistance: 1.65 },
      input_values: {
        electrodeType: 'pen',
        targetResistance: 1.8,
        rho: 70,
        groundwaterDepth: 2.8,
        drijfmethode: 'handhamer',
      },
    },
    meting: {
      id: 'sandbox-arn-met-0001',
      status: 'confirmed',
      monteur_email: 'demo@earthgnd.example',
      lat: 51.9851,
      lon: 5.8987,
      gps_accuracy_m: 5,
      postcode: '6811 EG',
      straatnaam: 'Jansbuitensingel',
      huisnummer: '6',
      woonplaats: 'Arnhem',
      depth_curve: curve([[3, 5.0], [6, 1.68]]),
      achieved_ra: 1.68,
      installed_depth: 6,
      electrode_type: 'pen',
      drijfmethode: 'handhamer',
      rods: null,
      aantal_pennen: 1,
      notes: 'DEMO — geen echte veldmeting. Droge bovenlaag, snelle daling onder GWT.',
      submitted_at: '2026-07-15T12:25:00.000Z',
      confirmed_at: '2026-07-15T13:40:00.000Z',
    },
  },
];

export function getSandboxCity(id: string | null | undefined): SandboxCityFixture {
  return SANDBOX_CITIES.find(c => c.id === id) ?? SANDBOX_CITIES[0];
}
