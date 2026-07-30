import type { GeographicStrengthRow, GrowthTrajectoryRow, MoatIndex } from './types';
import { moatReadinessFromConfidence } from './labels';

export interface MoatComponent {
  key: string;
  label: string;
  score0to10: number;
  detail: string;
}

export interface MoatBoardView {
  moatScore: number;
  interpretation: string;
  targetScore: number;
  components: MoatComponent[];
  provenRegions: number;
  emergingRegions: number;
  regionCount: number;
  monthlyDelta: number | null;
  cumulative: number;
  trendLabel: string;
}

export function deriveMoatBoardView(
  moat: MoatIndex | null,
  geographic: GeographicStrengthRow[],
  growth: GrowthTrajectoryRow[],
): MoatBoardView | null {
  if (!moat) return null;

  const volume10 = Math.min(10, (moat.total_measurements / moat.target_measurements) * 10);
  const confidence10 = moat.avg_confidence * 10;
  const empirical10 = Math.min(10, (moat.avg_empirical_percentage / 100) * 10);

  // Geographic coverage: share of signatures that are at least "emerging" (≥0.70)
  // plus soft credit for collecting (≥0.50)
  let geoScore = 0;
  let proven = 0;
  let emerging = 0;
  for (const r of geographic) {
    const level = moatReadinessFromConfidence(r.confidence_score);
    if (level === 'proven') { proven++; geoScore += 1; }
    else if (level === 'emerging') { emerging++; geoScore += 0.7; }
    else if (level === 'collecting') { geoScore += 0.35; }
  }
  const geo10 = geographic.length
    ? Math.min(10, (geoScore / Math.max(geographic.length, 1)) * 10)
    : 0;

  const components: MoatComponent[] = [
    {
      key: 'volume',
      label: 'Data volume',
      score0to10: round1(volume10),
      detail: `${moat.total_measurements} metingen · doel ${moat.target_measurements}`,
    },
    {
      key: 'confidence',
      label: 'Outcome-confidence',
      score0to10: round1(confidence10),
      detail: `Gemiddeld ${(moat.avg_confidence * 100).toFixed(0)}% over regio’s (uit voorspellingsfout + n)`,
    },
    {
      key: 'geographic',
      label: 'Geografische dekking',
      score0to10: round1(geo10),
      detail: `${proven} bewezen · ${emerging} ontstaat · ${geographic.length} signatures`,
    },
    {
      key: 'empirical',
      label: 'Empirische blend-tracking',
      score0to10: round1(empirical10),
      detail: `${moat.avg_empirical_percentage.toFixed(0)}% avg op gelinkte calcs (L2/L3/L4 blend)`,
    },
  ];

  const score = Number(moat.moat_index_0_to_10);
  let interpretation =
    'Vroege moat: product werkt overal; data-bewijs is nog dun. Focus op confirmed metingen met prediction-link.';
  if (score >= 8) interpretation = 'Sterke moat: outcomes ondersteunen premium data-claims in meerdere regio’s.';
  else if (score >= 6) interpretation = 'Moat groeit: enkele regio’s krijgen bewijs; nog geen fortress.';
  else if (score >= 3) interpretation = 'Moat in opbouw: theorie + eerste outcomes; claims regionaal houden.';

  const latest = growth[0];
  const prev = growth[1];
  const monthlyDelta = latest && prev
    ? Number(latest.cumulative_total) - Number(prev.cumulative_total)
    : latest
      ? Number(latest.measurements_this_month)
      : null;

  return {
    moatScore: score,
    interpretation,
    targetScore: 8.5,
    components,
    provenRegions: proven,
    emergingRegions: emerging,
    regionCount: geographic.length || moat.region_count,
    monthlyDelta,
    cumulative: Number(moat.total_measurements),
    trendLabel: monthlyDelta == null
      ? 'Nog geen trend'
      : monthlyDelta >= 6
        ? `+${monthlyDelta} outcomes deze maand (op tempo)`
        : `+${monthlyDelta ?? 0} outcomes deze maand (langzaam t.o.v. ~6/maand)`,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
