/** Formula library metadata for the Lab FORMULAS section. */

export type FormulaEntry = {
  id: string;
  title: string;
  latexish: string;
  symbols: { symbol: string; meaning: string; unit?: string }[];
  plainNl: string;
};

export const FORMULA_LIBRARY: FormulaEntry[] = [
  {
    id: 'dwight-forward',
    title: 'Dwight — voorwaarts (R uit ρ)',
    latexish: 'R = ρ / (2πL) × ln(4L/d)',
    symbols: [
      { symbol: 'R', meaning: 'weerstand', unit: 'Ω' },
      { symbol: 'ρ', meaning: 'schijnbare soortelijke weerstand', unit: 'Ω·m' },
      { symbol: 'L', meaning: 'elektrodediepte', unit: 'm' },
      { symbol: 'd', meaning: 'elektrodediameter', unit: 'm' },
    ],
    plainNl:
      'Bij grotere diepte L daalt R ongeveer omgekeerd evenredig met L (log-term groeit langzaam).',
  },
  {
    id: 'dwight-inverse',
    title: 'Dwight — inverse (ρ uit R)',
    latexish: 'ρ_apparent = R × 2πL / ln(4L/d)',
    symbols: [
      { symbol: 'ρ_apparent', meaning: 'afgeleide schijnbare ρ', unit: 'Ω·m' },
      { symbol: 'R', meaning: 'gemeten weerstand', unit: 'Ω' },
    ],
    plainNl:
      'Zelfde relatie omgekeerd: uit veld-R en geometrie volgt empirische ρ voor evidence.',
  },
  {
    id: 'precision',
    title: 'Bayesiaanse precisie',
    latexish: 'p = n / σ²',
    symbols: [
      { symbol: 'n', meaning: 'soft_n of n_virtual', unit: '—' },
      { symbol: 'σ', meaning: 'onzekerheid', unit: 'Ω·m' },
      { symbol: 'p', meaning: 'precisie (gewicht vóór normalisatie)', unit: '1/(Ω·m)²' },
    ],
    plainNl:
      'Meer n verhoogt invloed; grotere σ verlaagt invloed. Theorie gebruikt n_virtual, geen echte metingen.',
  },
  {
    id: 'posterior-mu',
    title: 'Posterior μ',
    latexish: 'μ_post = Σ(p_i × μ_i) / Σ p_i',
    symbols: [
      { symbol: 'μ_i', meaning: 'niveau-schatting', unit: 'Ω·m' },
      { symbol: 'μ_post', meaning: 'gecombineerde schatting', unit: 'Ω·m' },
    ],
    plainNl: 'Gewogen gemiddelde van theorie en empirie op precisie.',
  },
  {
    id: 'posterior-sigma',
    title: 'Posterior σ',
    latexish: 'σ_post = √(1 / Σ p_i)',
    symbols: [{ symbol: 'σ_post', meaning: 'gecombineerde onzekerheid', unit: 'Ω·m' }],
    plainNl: 'Meer onafhankelijk bewijs → smallere posterior (mits aannames kloppen).',
  },
  {
    id: 'manual-blend',
    title: 'Handmatige blend (simulatie)',
    latexish: 'ρ_manual = ρ_theory × (1 − w) + ρ_empirical × w',
    symbols: [{ symbol: 'w', meaning: 'handmatig empirisch aandeel 0–1', unit: '—' }],
    plainNl:
      'Dit is GEEN Bayes. Alleen simulatie — raakt productie niet.',
  },
  {
    id: 'soft-n',
    title: 'soft_n',
    latexish: 'soft_n = Σ (P(class|ρ) × confidence)',
    symbols: [
      { symbol: 'P(class|ρ)', meaning: 'zachte klassekans uit likelihood', unit: '—' },
      { symbol: 'confidence', meaning: 'meetkwaliteit-factor', unit: '—' },
    ],
    plainNl:
      'soft_n kan lager zijn dan ruwe n. Herhaalde elektrodes op één plek zijn geen onafhankelijke locaties — zie unique_site_n.',
  },
  {
    id: 'site-independence',
    title: 'Site-onafhankelijkheid',
    latexish: 'unique_site_n = |clusters(radius, siteKey)|',
    symbols: [
      { symbol: 'radius', meaning: 'clusterstraal', unit: 'm' },
      { symbol: 'siteKey', meaning: 'adres/project-sleutel', unit: '—' },
    ],
    plainNl:
      '12 elektrodes op De Laireweg = 1 physical site. Nooit raw electrode n als geografische steekproef gebruiken.',
  },
  {
    id: 'geomean-depth',
    title: 'GeoMean dieptefactor',
    latexish: 'geoMean = exp(mean(ln(toolDepth / fieldDepth)))',
    symbols: [
      { symbol: 'toolDepth', meaning: 'voorspelde diepte', unit: 'm' },
      { symbol: 'fieldDepth', meaning: 'velddiepte', unit: 'm' },
    ],
    plainNl: 'Poort 2 drempel: geoMean ≤ 1.30 per locatie (gate:depth).',
  },
  {
    id: 'relative-error',
    title: 'Relatieve fout',
    latexish: 'rel% = |pred − actual| / actual × 100',
    symbols: [{ symbol: 'rel%', meaning: 'relatieve fout', unit: '%' }],
    plainNl: 'Vergelijkt voorspelling met ground truth op dezelfde schaal.',
  },
  {
    id: 'agreement',
    title: 'Agreement score',
    latexish: 'agreement = max(0, 1 − rel%/100)',
    symbols: [{ symbol: 'agreement', meaning: 'overeenkomst', unit: '0–1' }],
    plainNl: '1 = perfect; 0 bij ≥100% relatieve fout.',
  },
  {
    id: 'oos-mae-mape',
    title: 'OOS MAE / MAPE',
    latexish: 'MAE = mean(|e|); MAPE = mean(rel%)',
    symbols: [
      { symbol: 'e', meaning: 'pred − actual', unit: 'Ω·m' },
      { symbol: 'MAE', meaning: 'mean absolute error', unit: 'Ω·m' },
      { symbol: 'MAPE', meaning: 'mean absolute percentage error', unit: '%' },
    ],
    plainNl:
      'Poort 3: empirisch model mag theorie niet meaningful verslechteren (site holdout).',
  },
];
