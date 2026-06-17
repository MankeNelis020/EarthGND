/**
 * Stage 5 — Source / confidence scoring (Error class C).
 * Maps data source + distance + age to a confidence label.
 *
 * Rule: "BRO ✓" badge is ONLY shown when data actually comes from a BRO measurement.
 * Generic defaults, fallbacks, and manual picks get appropriate labels — never "BRO ✓".
 */

import type { ValidatedDiepteInput } from './parse';
import type { SourceConfidence, ConfidenceLevel, DataSource } from './types';
import { PLAUSIBILITY_THRESHOLDS as T } from './config';

// ─── Source labels (NL) ───────────────────────────────────────────────────────

const SOURCE_LABELS: Record<DataSource, string> = {
  cpt:       'CPT-sondering (BRO)',
  bhrgt:     'Geotechnische boring (BRO)',
  geotop:    'GeoTOP voxelmodel (TNO/BRO)',
  bodemkaart:'Bodemkaart 1:50.000',
  manual:    'Handmatige invoer',
  fallback:  'Generieke standaardwaarde',
};

function baseLevel(source: DataSource): ConfidenceLevel {
  switch (source) {
    case 'cpt':        return 'hoog';
    case 'bhrgt':      return 'midden';
    case 'geotop':     return 'midden';
    case 'bodemkaart': return 'midden';
    case 'manual':     return 'midden';
    case 'fallback':   return 'laag';
  }
}

function isBROSource(source: DataSource): boolean {
  return source === 'cpt' || source === 'bhrgt' || source === 'geotop';
}

function downgradeForDistance(
  level: ConfidenceLevel,
  boringAfstand?: number,
): ConfidenceLevel {
  if (boringAfstand == null) return level;
  if (boringAfstand > T.boringAfstandLow) {
    // > 1 km: drop two levels if possible
    return level === 'hoog' ? 'midden' : 'laag';
  }
  if (boringAfstand > T.boringAfstandMedium) {
    // 250 m – 1 km: drop one level
    return level === 'hoog' ? 'midden' : level;
  }
  return level;
}

const ICONS: Record<ConfidenceLevel, '✓' | '~' | '⚠'> = {
  hoog:   '✓',
  midden: '~',
  laag:   '⚠',
};

// ─── Main scoring function ────────────────────────────────────────────────────

export function scoreConfidence(input: ValidatedDiepteInput): SourceConfidence {
  const source = input.dataSource;
  const base   = baseLevel(source);
  const level  = downgradeForDistance(base, input.boringAfstand);

  const distanceSuffix = input.boringAfstand != null
    ? ` op ${input.boringAfstand < 1
        ? Math.round(input.boringAfstand * 1000) + ' m'
        : input.boringAfstand.toFixed(1) + ' km'} afstand`
    : '';

  const label = SOURCE_LABELS[source] + distanceSuffix;

  return {
    level,
    label,
    icon:         ICONS[level],
    showBROBadge: isBROSource(source) && level !== 'laag',
  };
}

/** Human-readable summary line for the UI-explanation layer */
export function confidenceSummary(confidence: SourceConfidence): string {
  const levelLabel = { hoog: 'Hoog', midden: 'Gemiddeld', laag: 'Laag' }[confidence.level];
  return `${confidence.icon} Herkomst: ${confidence.label} · Zekerheid: ${levelLabel}`;
}
