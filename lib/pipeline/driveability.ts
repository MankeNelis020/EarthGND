/**
 * Driveability model — maximum achievable rod depth per driving method × soil type.
 *
 * Driving methods (NL practice):
 *   handslag    — manual slide hammer, standard for shallow residential work
 *   sds         — SDS rotary-hammer adapter, most common professional tool
 *   pneumatisch — pneumatic hammer (e.g. Hilti TE 700), deeper penetration
 *   voorboren   — pre-drilled pilot hole, bypasses hard layers entirely
 *
 * lithoClass scale (EarthGND 1–5):
 *   1 = klei       2 = leem       3 = zand       4 = grind      5 = veen
 *
 * Values are engineering assumptions for Dutch soil conditions and are displayed
 * as bands (low/typical/high) — NOT as single-value hard limits. Sources:
 *   - KEMA/Kiwa field studies on copper-bonded steel rods in NL soils
 *   - NEN 3840 / NEN 3141 aarding installation practice guides
 *   - Manufacturer specs (Erico/Kopex, Galmar) for each drive method
 */

export type DriveMethod = 'handslag' | 'sds' | 'pneumatisch' | 'voorboren';

export interface ZMaxBand {
  low:     number;   // pessimistic m (compact or wet soil)
  typical: number;   // median expected m
  high:    number;   // optimistic m (loose/dry soil)
}

export interface RefusalLayer {
  depth:      number;   // m from maaiveld where hard layer starts
  lithoClass: number;
  soil:       string;   // human-readable NL name
}

export interface DriveabilityResult {
  zMax:         ZMaxBand;
  refusalLayer: RefusalLayer | null;
  isLimited:    boolean;         // zMax.typical < zReq
  targetUnreachable: boolean;    // even max rods at zMax can't reach targetR
}

// ─── Method soft limits (m) — applies when no hard stop is encountered ────────
// These reflect human/mechanical fatigue + equipment length constraints.

export const METHOD_SOFT_LIMIT: Record<DriveMethod, ZMaxBand> = {
  handslag:    { low: 5,  typical: 8,  high: 12 },
  sds:         { low: 7,  typical: 11, high: 16 },
  pneumatisch: { low: 12, typical: 17, high: 25 },
  voorboren:   { low: 25, typical: 35, high: 50 },
};

// Method display labels used in UI
export const DRIVE_METHOD_LABELS: Record<DriveMethod, string> = {
  handslag:    'Handslag',
  sds:         'SDS-breekhamer',
  pneumatisch: 'Pneumatisch',
  voorboren:   'Voorboren',
};

// ─── Grind penetration (m beyond grind top) per method ───────────────────────
// When grind (lithoClass 4) is encountered, these additional metres are possible.

const GRIND_PENETRATION: Record<DriveMethod, ZMaxBand> = {
  handslag:    { low: 0,   typical: 0.3, high: 0.8 },
  sds:         { low: 0.3, typical: 1.0, high: 2.0 },
  pneumatisch: { low: 0.5, typical: 2.0, high: 4.0 },
  voorboren:   { low: 20,  typical: 30,  high: 40  }, // drills through — same as soft limit
};

// ─── lithoClass names ─────────────────────────────────────────────────────────

const LITHO_NAMES: Record<number, string> = {
  1: 'klei',
  2: 'leem',
  3: 'zand',
  4: 'grind',
  5: 'veen',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the maximum achievable rod depth for a given soil profile and method.
 *
 * @param samples   Depth-sorted soil samples [{depth, lithoClass}]
 * @param method    Selected driving method
 * @param zReq      Required depth from Dwight solver (m) — gemiddeld scenario
 */
export function calcZMax(
  samples: ReadonlyArray<{ depth: number; lithoClass: number }>,
  method:  DriveMethod,
  zReq:    number,
): DriveabilityResult {
  const softLimit = METHOD_SOFT_LIMIT[method];

  // Walk samples in ascending depth order; find first hard-stop layer.
  // Only lithoClass 4 (grind) triggers a hard stop for driven methods.
  for (const s of [...samples].sort((a, b) => a.depth - b.depth)) {
    if (s.depth > zReq + 1) break; // no need to check far beyond required depth

    if (s.lithoClass === 4) {
      const pene = GRIND_PENETRATION[method];
      const zMax: ZMaxBand = {
        low:     Math.round((s.depth + pene.low)     * 10) / 10,
        typical: Math.round((s.depth + pene.typical) * 10) / 10,
        high:    Math.round((s.depth + pene.high)    * 10) / 10,
      };
      return {
        zMax,
        refusalLayer: { depth: s.depth, lithoClass: 4, soil: LITHO_NAMES[4] },
        isLimited:    zMax.typical < zReq,
        targetUnreachable: false, // set by caller after n-rod check
      };
    }
  }

  // No hard stop — soft limit applies
  const isLimited = softLimit.typical < zReq;
  const zMax: ZMaxBand = {
    low:     Math.round(Math.min(softLimit.low, zReq) * 10) / 10,
    typical: Math.round((isLimited ? softLimit.typical : zReq) * 10) / 10,
    high:    Math.round(softLimit.high * 10) / 10,
  };
  return {
    zMax,
    refusalLayer: null,
    isLimited,
    targetUnreachable: false,
  };
}
