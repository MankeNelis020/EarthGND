/**
 * Shared types voor de hiërarchische kennisarchitectuur (Fase -1).
 *
 * Vier niveaus:
 *   L1 Literatuurprior    — bevroren referentie
 *   L2 Globale klassekennis — Welford accumulatie per lithoClass
 *   L3 Regionale prior    — Welford accumulatie per (5×5 km RD-cel × lithoClass)
 *   L4 Lokale observaties  — directe meting, query-time IDW-interpolatie
 */

/** Gaussiaanse schatting met onzekerheid en effectieve steekproefomvang. */
export interface LevelEstimate {
  mu: number;    // Ω·m — centraalschatting
  sigma: number; // Ω·m — standaardafwijking (1σ)
  n: number;     // effectieve steekproefomvang (soft_n voor L2/L3, IDW-gewogen voor L4)
}

/** Precisie-gewogen Bayesiaanse posterior van meerdere LevelEstimates. */
export interface PosteriorResult {
  mu: number;
  sigma: number;
  n: number;
  /** Bijdragen per niveau — null als niveau geen bruikbare data had. */
  breakdown: {
    l1: LevelEstimate;
    l2: LevelEstimate | null;
    l3: LevelEstimate | null;
    l4: LevelEstimate | null;
  };
}

/**
 * Klasse-kansverdeling over alle lithoClasses (1–5).
 * Waarden sommeren tot ~1 (kleine afrondingsafwijking toegestaan).
 * Klasse 4 (grind) kan aanwezig zijn — wordt WEL opgeslagen, NIET gebruikt voor learning.
 */
export type ClassDistribution = Partial<Record<number, number>>;

/** Ρ_apparent + klassekansverdeling per dieptepunt na reverse-engine verwerking. */
export interface AnalyzedDepthPoint {
  depthM: number;
  rhoApparent: number;
  zone: 'dry' | 'wet';         // boven vs. onder grondwaterdiepte
  classDist: ClassDistribution; // proportionele kansverdeling
}

/** Database-rij voor soil_evidence (Layer 2 afgeleide). */
export interface SoilEvidenceRow {
  meting_id: string;
  depth_m: number;
  rho_apparent: number;
  zone: 'dry' | 'wet';
  derivation_method: string;
  p_klei: number;
  p_leem: number;
  p_zand: number;
  p_grind: number;
  p_veen: number;
  bro_litho_class: number | null;
  bro_rho_wet: number | null;
  consistency_ratio: number | null;
  flagged_inconsistent: boolean;
}

/** Welford gewogen online variantie — drie kolommen. */
export interface WelfordState {
  total_weight: number;  // soft_n (som proportionele gewichten)
  welford_mean: number;  // gewogen gemiddelde ρ (Ω·m)
  welford_m2: number;    // gewogen kwadratensom (voor σ berekening)
}

/** Handmatige import-invoer (JSON of seed vanuit field-data.ts). */
export interface ImportRecord {
  label: string;
  lat?: number;
  lon?: number;
  address?: string;
  gwDepth: number;
  broLithoClass?: number;
  broGwDepth?: number;
  broBoringAfstand?: number;
  broRhoWet?: number;
  depthCurve: Array<{ depth: number; ra: number }>;
  measurementQuality?: 'goed' | 'twijfelachtig' | 'onbruikbaar';
  electrodeCount?: number;
  notes?: string;
}
