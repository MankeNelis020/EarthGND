/**
 * Product vs moat language.
 *
 * Product (Dwight + BRO + L2/L3/L4) is available everywhere in NL.
 * Moat readiness = whether we have enough local *outcomes* to claim
 * accuracy with data, not whether the calculator works.
 */

export type MoatReadinessLevel = 'proven' | 'emerging' | 'collecting' | 'thin';

export function moatReadinessFromConfidence(confidence: number | null | undefined): MoatReadinessLevel {
  const c = confidence ?? 0;
  if (c >= 0.85) return 'proven';
  if (c >= 0.70) return 'emerging';
  if (c >= 0.50) return 'collecting';
  return 'thin';
}

export function moatReadinessLabel(level: MoatReadinessLevel): string {
  switch (level) {
    case 'proven':     return 'Moat bewezen';
    case 'emerging':   return 'Moat ontstaat';
    case 'collecting': return 'Outcomes verzamelen';
    case 'thin':       return 'Te dun voor claim';
  }
}

export function moatReadinessHint(level: MoatReadinessLevel): string {
  switch (level) {
    case 'proven':
      return 'Genoeg lokale uitkomsten om accuracy met data te claimen (premium data-story).';
    case 'emerging':
      return 'Lokale uitkomsten tonen richting — claim met nuance, niet als fortress.';
    case 'collecting':
      return 'Calculator werkt (theorie); moat-claim nog zwak — meer confirmed metingen nodig.';
    case 'thin':
      return 'Product beschikbaar; te weinig outcomes voor een regionale data-claim.';
  }
}

/** Pricing power of the *data claim*, not product availability. */
export function dataClaimTierLabel(tier: string | null | undefined): string {
  switch (tier) {
    case 'premium':  return 'Premium data-claim';
    case 'standard': return 'Standaard data-claim';
    case 'pilot':    return 'Pilot data-claim';
    case 'building': return 'Nog geen data-claim';
    default:         return tier ?? '—';
  }
}

/** Map legacy RPC readiness strings → moat language. */
export function normalizeReadinessStatus(raw: string | null | undefined, confidence?: number | null): string {
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower.includes('confidence') || lower.includes('proven') || lower.includes('caveat')) {
      // already or partially new
    }
    if (lower.includes('not ready') || lower === 'not ready') {
      return moatReadinessLabel(moatReadinessFromConfidence(confidence));
    }
    if (lower.includes('building')) return moatReadinessLabel('collecting');
    if (lower.includes('sell with confidence')) return moatReadinessLabel('proven');
    if (lower.includes('sell with caveats')) return moatReadinessLabel('emerging');
  }
  return moatReadinessLabel(moatReadinessFromConfidence(confidence));
}

export const PRODUCT_AVAILABILITY_LINE =
  'Product overal beschikbaar: Dwight + BRO (+ lokale/grondsoort-priors wanneer actief). Moat-score = bewijs uit veldoutcomes, niet product-toegang.';
