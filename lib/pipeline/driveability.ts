/**
 * Driveability module — rekenlogica voor maximale indrijfdiepte.
 *
 * De WAARDEN staan in driveability-config.ts (het rekenmodel).
 * Dit bestand bevat alleen de logica; pas het niet aan als je alleen
 * tabelwaarden wil bijwerken.
 */

import {
  DRIVEABILITY_TABLE,
  LITHO_CLASS_TO_GRND,
  getDriveEntry,
  type GrndType,
  type DriveMethodKey,
  type ZMaxEntry,
} from './driveability-config';
import { DEFAULT_ELECTRODE_DIAMETER_M, driveabilityDiameterScale } from '@/lib/electrode-diameter';

export type DriveMethod = DriveMethodKey;
export type { GrndType, ZMaxEntry };

export interface ZMaxBand {
  low:     number;
  typical: number;
  high:    number;
}

export interface RefusalLayer {
  depth:      number;   // m from maaiveld
  lithoClass: number;
  soil:       string;   // human-readable NL
  warning?:   boolean;  // ⚠️ bereikbaar maar moeilijk
}

export interface DriveabilityResult {
  zMax:              ZMaxBand;
  refusalLayer:      RefusalLayer | null;
  /** typical < zReq: methode zit aan zijn gemiddelde grens — toon waarschuwing in UI */
  isLimited:         boolean;
  /** high < zReq: zelfs in optimale condities onhaalbaar met 1 pen — activeer paralleladvies */
  requiresParallel:  boolean;
  targetUnreachable: boolean;
}

// Display labels voor UI — hier zodat de UI niet de config hoeft te importeren
export const DRIVE_METHOD_LABELS: Record<DriveMethod, string> = {
  handslag:    'Handslag',
  sds:         'SDS-breekhamer',
  pneumatisch: 'Pneumatisch',
  voorboren:   'Voorboren',
};

/** Methoden die zichtbaar zijn in de UI. Handslag en Voorboren zijn uit productie genomen. */
export const ACTIVE_DRIVE_METHODS: DriveMethod[] = ['sds', 'pneumatisch'];

const LITHO_NAMES: Record<number, string> = {
  1: 'klei', 2: 'leem', 3: 'zand', 4: 'grind', 5: 'veen', 6: 'rots/keien',
};

// ─── Hulpfunctie: lithoClass → ZMaxEntry voor een methode ────────────────────

function entryForLitho(lithoClass: number, method: DriveMethod): ZMaxEntry {
  const grnd: GrndType = LITHO_CLASS_TO_GRND[lithoClass] ?? 'zand_los';
  return getDriveEntry(grnd, method);
}

function scaleZMaxBand(band: ZMaxBand, scale: number): ZMaxBand {
  const s = Math.max(0.1, scale);
  return {
    low:     Math.round(band.low * s * 10) / 10,
    typical: Math.round(band.typical * s * 10) / 10,
    high:    Math.round(band.high * s * 10) / 10,
  };
}

// ─── Publieke API ─────────────────────────────────────────────────────────────

/**
 * Bereken de maximaal haalbare indrijfdiepte voor een bodemkolom en methode.
 *
 * @param samples        Gesorteerde bodemsamples [{depth (positief, m), lithoClass}]
 * @param method         Gekozen drijfmethode
 * @param zReq           Benodigde diepte uit Dwight-solver (gemiddeld scenario, m)
 * @param rodDiameterM   Diameter geslagen elektrode in m (default 14 mm)
 */
export function calcZMax(
  samples: ReadonlyArray<{ depth: number; lithoClass: number }>,
  method:  DriveMethod,
  zReq:    number,
  rodDiameterM: number = DEFAULT_ELECTRODE_DIAMETER_M,
): DriveabilityResult {
  const diameterScale = driveabilityDiameterScale(rodDiameterM);
  const sorted = [...samples].sort((a, b) => a.depth - b.depth);

  for (const s of sorted) {
    if (s.depth > zReq + 1) break;

    const entry = entryForLitho(s.lithoClass, method);

    if (entry.refusal) {
      const zMax = scaleZMaxBand({ low: s.depth, typical: s.depth, high: s.depth }, diameterScale);
      return {
        zMax,
        refusalLayer: { depth: s.depth, lithoClass: s.lithoClass, soil: LITHO_NAMES[s.lithoClass] ?? 'onbekend' },
        isLimited:        true,
        requiresParallel: true,
        targetUnreachable: false,
      };
    }

    // Grind of andere beperkte laag: controle of typische diepte begrenst
    if (entry.typical < s.depth) {
      // De laag wordt bereikt op s.depth maar entry.typical zegt hoe diep je erin kunt
      const zMaxRaw: ZMaxBand = {
        low:     Math.round((s.depth + entry.low)     * 10) / 10,
        typical: Math.round((s.depth + entry.typical) * 10) / 10,
        high:    Math.round((s.depth + entry.high)    * 10) / 10,
      };
      const zMax = scaleZMaxBand(zMaxRaw, diameterScale);
      return {
        zMax,
        refusalLayer: {
          depth:     s.depth,
          lithoClass: s.lithoClass,
          soil:      LITHO_NAMES[s.lithoClass] ?? 'onbekend',
          warning:   entry.warning,
        },
        isLimited:        zMax.typical < zReq,
        requiresParallel: zMax.high    < zReq,
        targetUnreachable: false,
      };
    }
  }

  // Geen begrenzende laag gevonden binnen z_req — methode-maximum is de grens
  // Gebruik het dominante (eerste) sample voor de methode-band
  const dominantEntry = sorted[0]
    ? entryForLitho(sorted[0].lithoClass, method)
    : getDriveEntry('zand_los', method);

  const isLimited        = dominantEntry.typical < zReq;
  const requiresParallel = dominantEntry.high    < zReq;
  const zMaxRaw: ZMaxBand = {
    low:     Math.round(Math.min(dominantEntry.low, zReq)              * 10) / 10,
    typical: Math.round((isLimited ? dominantEntry.typical : zReq)     * 10) / 10,
    high:    Math.round(dominantEntry.high                              * 10) / 10,
  };
  const zMax = scaleZMaxBand(zMaxRaw, diameterScale);
  return {
    zMax,
    refusalLayer: null,
    isLimited,
    requiresParallel,
    targetUnreachable: false,
  };
}

// ─── Hulpfunctie voor DriveabilityBlock: alle methoden voor dezelfde bodem ───

export function calcAllMethods(
  samples: ReadonlyArray<{ depth: number; lithoClass: number }>,
  zReq:    number,
  rodDiameterM: number = DEFAULT_ELECTRODE_DIAMETER_M,
): Record<DriveMethod, DriveabilityResult> {
  const methods: DriveMethod[] = ['handslag', 'sds', 'pneumatisch', 'voorboren'];
  return Object.fromEntries(
    methods.map(m => [m, calcZMax(samples, m, zReq, rodDiameterM)])
  ) as Record<DriveMethod, DriveabilityResult>;
}

// Re-export voor gebruik in de UI zonder directe config-import
export { DRIVEABILITY_TABLE, LITHO_CLASS_TO_GRND };
export type { DriveMethodKey };
