export type RapportStatus = 'concept' | 'ondertekend';
export type Systeemtype = 'TT' | 'TN-S' | 'TN-C-S' | 'IT';
export type AardWerkzaamheden = 'nieuw' | 'wijziging' | 'uitbreiding';
export type ElektrodeType = 'pen' | 'staaf' | 'plaat' | 'fundatieaarder' | 'lint';
export type PassFail = 'pass' | 'fail' | 'nvt';
export type BevindingPrioriteit = 'A' | 'B' | 'C';

export type MetingType =
  | 'ra'              // Aardverspreidingsweerstand [Ω]
  | 'continuiteit_pe' // Continuïteit PE-leider [Ω]
  | 'isolatie'        // Isolatieweerstand [MΩ]
  | 'rcd_tijd'        // RCD uitschakeltijd [ms]
  | 'rcd_stroom'      // RCD aanspreekstroom [mA]
  | 'lusimpedantie';  // Lusimpedantie Zs [Ω]

export interface Meting {
  id?: string;
  type: MetingType;
  waarde: number | null;
  eenheid: string;
  meetmethode?: string;
  toetswaarde?: number | null;
  pass_fail?: PassFail | null;
  notities?: string;
}

export interface Bevinding {
  id: string;
  nummer: number;
  omschrijving: string;
  prioriteit: BevindingPrioriteit;
}

export interface AuditRecord {
  actie: string;
  door: string;
  op: string;
  detail?: string;
}

export interface ScanContext {
  postcode?: string;
  rho?: number;
  grondwaterstand_m?: number;
  ph?: number;
  voorspeld_diepte_m?: number;
  voorspeld_ra_ohm?: number;
  gemeten_ra_ohm?: number;
  gemeten_diepte_m?: number;
  veldmeting_status?: string;
  veldmeting_op?: string;
  risicoklasse?: string;
  databron?: string;
  berekend_op?: string;
}

export interface InspectionReport {
  id: string;
  user_id: string;
  project_id?: string;
  calculation_id?: string;
  status: RapportStatus;
  versie: number;

  // Deel 1
  opdrachtgever?: string;
  locatie?: string;
  soort_installatie?: string;
  aard_werkzaamheden?: AardWerkzaamheden;
  systeemtype?: Systeemtype;
  elektrode_type?: string;
  elektrode_materiaal?: string;
  elektrode_diepte_m?: number | null;
  elektrode_aantal?: number;
  uitvoerder_naam?: string;
  uitvoerder_erkenning?: string;
  datum_uitvoering?: string;

  scan_context?: ScanContext;

  // Deel 3
  bevindingen?: Bevinding[];
  eindconclusie?: string;

  // Conformiteitsverklaring
  conformiteit_akkoord?: boolean;
  conformiteit_naam?: string;
  conformiteit_erkenning?: string;
  conformiteit_datum?: string;

  // Delen
  deel_akkoord?: boolean;
  deel_pdf?: boolean;
  deel_json?: boolean;
  deel_ontvanger_naam?: string;
  deel_ontvanger_email?: string;
  deel_status?: string;
  deel_verzonden_op?: string;

  // AVG
  consent_delen?: boolean;
  consent_kalibratie?: boolean;

  audit_trail?: AuditRecord[];
  pdf_url?: string;
  klic_melding_id?: string | null;
  created_at: string;
  updated_at: string;
}

// Metingen live in a separate table, fetched alongside the report
export interface RapportWithMetingen extends InspectionReport {
  metingen: Meting[];
}

// Payload for creating a new report
export interface CreateRapportPayload {
  calculation_id?: string;
  project_id?: string;
  scan_context?: ScanContext;
  systeemtype?: Systeemtype;
  locatie?: string;
  postcode?: string;
}

// Payload for saving (draft) the report
export type UpdateRapportPayload = Partial<
  Pick<
    InspectionReport,
    | 'opdrachtgever' | 'locatie' | 'soort_installatie' | 'aard_werkzaamheden'
    | 'systeemtype' | 'elektrode_type' | 'elektrode_materiaal'
    | 'elektrode_diepte_m' | 'elektrode_aantal'
    | 'uitvoerder_naam' | 'uitvoerder_erkenning' | 'datum_uitvoering'
    | 'bevindingen' | 'eindconclusie'
    | 'deel_akkoord' | 'deel_pdf' | 'deel_json'
    | 'deel_ontvanger_naam' | 'deel_ontvanger_email'
    | 'consent_delen' | 'consent_kalibratie'
  >
> & { metingen?: Meting[] };

// Payload for signing
export interface SignPayload {
  naam: string;
  erkenning: string;
  akkoord: boolean;
  consent_delen: boolean;
  consent_kalibratie: boolean;
  deel_ontvanger_email?: string;
  deel_ontvanger_naam?: string;
  deel_pdf?: boolean;
  deel_json?: boolean;
}
