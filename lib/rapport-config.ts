// ─── Configureerbare normparameters ───────────────────────────────────────────
// Gebaseerd op NEN 1010:2020 en NEN 3140. NIET hardcoded in logica;
// altijd via deze config ophalen zodat een bevoegd persoon ze kan aanpassen.
// Beheer: update dit bestand + maak een nieuwe deploy.

import type { MetingType, Systeemtype } from '@/lib/types/rapport';

export interface NormParam {
  type: MetingType;
  label: string;
  eenheid: string;
  defaultToetswaarde: number | null;
  toetswaardeLabel: string;
  richting: 'max' | 'min'; // pass = waarde ≤ max, of waarde ≥ min
  sanityMin: number;
  sanityMax: number;
  meetmethodeOpties: string[];
  beschrijving: string;
}

// Alle meettypen met hun normparameters
export const NORM_PARAMS: Record<MetingType, NormParam> = {
  ra: {
    type: 'ra',
    label: 'Aardverspreidingsweerstand Ra',
    eenheid: 'Ω',
    defaultToetswaarde: null,        // afhankelijk van systeemtype + beveiliging
    toetswaardeLabel: 'Max. Ra (Ω)',
    richting: 'max',
    sanityMin: 0,
    sanityMax: 10000,
    meetmethodeOpties: [
      '3-punts / 62%-methode',
      'Aardlustmeting (clamp)',
      'Stakenmethode',
      'Anders',
    ],
    beschrijving:
      'Weerstand van de aardelektrode ten opzichte van verre aarde. ' +
      'De toetswaarde is afhankelijk van het systeemtype en de toegepaste beveiliging ' +
      '(bv. Ra × IΔn ≤ UL). De installateur stelt de toetswaarde in conform de geldende norm.',
  },
  continuiteit_pe: {
    type: 'continuiteit_pe',
    label: 'Continuïteit beschermingsleiding (PE)',
    eenheid: 'Ω',
    defaultToetswaarde: 1,
    toetswaardeLabel: 'Max. weerstand (Ω)',
    richting: 'max',
    sanityMin: 0,
    sanityMax: 200,
    meetmethodeOpties: [
      'Doormelding met laagohmmeter',
      '200 mA doormelding',
      'Anders',
    ],
    beschrijving:
      'Continuïteit van de beschermingsleidingen (PE/PEN). ' +
      'Toetswaarde conform NEN 1010; installateur vult de voor dit circuit geldende grenswaarde in.',
  },
  isolatie: {
    type: 'isolatie',
    label: 'Isolatieweerstand',
    eenheid: 'MΩ',
    defaultToetswaarde: 1,
    toetswaardeLabel: 'Min. isolatieweerstand (MΩ)',
    richting: 'min',
    sanityMin: 0,
    sanityMax: 9999,
    meetmethodeOpties: [
      '500 V DC meting',
      '250 V DC meting',
      '1000 V DC meting',
      'Anders',
    ],
    beschrijving:
      'Isolatieweerstand tussen actieve geleiders en aarde. Minimumwaarde conform NEN 1010.',
  },
  rcd_tijd: {
    type: 'rcd_tijd',
    label: 'RCD uitschakeltijd',
    eenheid: 'ms',
    defaultToetswaarde: 300,
    toetswaardeLabel: 'Max. uitschakeltijd (ms)',
    richting: 'max',
    sanityMin: 0,
    sanityMax: 2000,
    meetmethodeOpties: [
      'Tester op IΔn',
      'Tester op 5 × IΔn',
      'Anders',
    ],
    beschrijving:
      'Gemeten uitschakeltijd van de aardlekschakelaar bij IΔn. ' +
      'Maximumwaarde conform NEN 1010 (gewoonlijk ≤ 300 ms bij IΔn; ≤ 40 ms bij 5 × IΔn).',
  },
  rcd_stroom: {
    type: 'rcd_stroom',
    label: 'RCD aanspreekstroom',
    eenheid: 'mA',
    defaultToetswaarde: null,
    toetswaardeLabel: 'Nominale IΔn (mA)',
    richting: 'max',
    sanityMin: 0,
    sanityMax: 1000,
    meetmethodeOpties: [
      'Ramptest (langzaam oplopen)',
      'Tester automatisch',
      'Anders',
    ],
    beschrijving:
      'Gemeten aanspreekstroom van de RCD. Moet ≤ IΔn zijn (conform NEN 1010).',
  },
  lusimpedantie: {
    type: 'lusimpedantie',
    label: 'Lusimpedantie Zs',
    eenheid: 'Ω',
    defaultToetswaarde: null,
    toetswaardeLabel: 'Max. Zs (Ω)',
    richting: 'max',
    sanityMin: 0,
    sanityMax: 2000,
    meetmethodeOpties: [
      'Lusimpedantiemeter',
      'Berekend uit Uo en Ia',
      'Anders',
    ],
    beschrijving:
      'Totale lusimpedantie van het kortsluitcircuit. ' +
      'Toetswaarde: Zs ≤ Uo / Ia (NEN 1010). Installateur vult de geldende grenswaarde in.',
  },
};

// Welke metingen zijn verplicht per systeemtype
export const VERPLICHTE_METINGEN: Record<Systeemtype, MetingType[]> = {
  'TT':     ['ra', 'continuiteit_pe', 'isolatie', 'rcd_tijd', 'rcd_stroom'],
  'TN-S':   ['continuiteit_pe', 'isolatie', 'lusimpedantie'],
  'TN-C-S': ['continuiteit_pe', 'isolatie', 'lusimpedantie'],
  'IT':     ['ra', 'continuiteit_pe', 'isolatie'],
};

// Optionele metingen per systeemtype
export const OPTIONELE_METINGEN: Record<Systeemtype, MetingType[]> = {
  'TT':     ['lusimpedantie'],
  'TN-S':   ['rcd_tijd', 'rcd_stroom'],
  'TN-C-S': ['rcd_tijd', 'rcd_stroom'],
  'IT':     ['lusimpedantie'],
};

// Alle metingen voor een systeemtype (verplicht + optioneel)
export function getMetingenVoorStelsel(systeemtype: Systeemtype): MetingType[] {
  return [
    ...VERPLICHTE_METINGEN[systeemtype],
    ...OPTIONELE_METINGEN[systeemtype],
  ];
}

export function isVerplicht(type: MetingType, systeemtype: Systeemtype): boolean {
  return VERPLICHTE_METINGEN[systeemtype].includes(type);
}

// Toets een meting: geeft pass/fail/nvt
export function toetsMeting(
  type: MetingType,
  waarde: number | null,
  toetswaarde: number | null,
): 'pass' | 'fail' | 'nvt' {
  if (waarde === null || toetswaarde === null) return 'nvt';
  const param = NORM_PARAMS[type];
  if (param.richting === 'max') return waarde <= toetswaarde ? 'pass' : 'fail';
  return waarde >= toetswaarde ? 'pass' : 'fail';
}

// Rekenhulp: aanrakingsspanning bij gegeven Ra en IΔn
export function berekenAanrakingsspanning(ra: number, ideltaN_mA: number): number {
  return ra * (ideltaN_mA / 1000);
}
