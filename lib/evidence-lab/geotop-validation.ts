/**
 * Build GeoTOP validation rows from a measurement + independent geology.
 * NEVER infers lithology from rho — GeoTOP class comes from provider only.
 */

import { deriveRhoApparent } from '@/lib/soil-knowledge/reverse-engine';
import { LITERATURE_PRIOR } from '@/lib/soil-knowledge/priors';
import {
  absoluteError,
  agreementFromRelativeErrorPct,
  relativeErrorPct,
} from './metrics';
import {
  dominantEarthGndClass,
  geotopRawLabel,
  mapGeotopToEarthGndDist,
} from './geotop-mapping';
import { GEOTOP } from '@/lib/geotop-config';
import { mmToRodDiameterM } from '@/lib/electrode-diameter';

export type DepthCurvePoint = { depth_m: number; ra_ohm: number };

export type GeotopColumnSample = {
  /** Depth below maaiveld (m), positive down. */
  depthM: number;
  geotopKlas: number;
  probability: number | null;
};

export type GeotopValidationRow = {
  metingId: string;
  electrodeNo: number | null;
  lat: number;
  lon: number;
  siteClusterId: string;
  depthM: number;
  measuredRaOhm: number;
  empiricalRhoOhmM: number;
  geotopRawLithology: string;
  geotopKlas: number;
  geotopProbability: number | null;
  earthgndLithoClass: number;
  earthgndClassDist: Record<string, number>;
  theoreticalMu: number;
  theoreticalSigma: number;
  absoluteError: number;
  relativeErrorPct: number | null;
  agreementScore: number;
  sourceVersion: string;
  exclusionReason: string | null;
};

function geotopAtDepth(
  column: GeotopColumnSample[],
  depthM: number,
): GeotopColumnSample | null {
  if (!column.length) return null;
  let best = column[0]!;
  let bestD = Math.abs(best.depthM - depthM);
  for (const s of column) {
    const d = Math.abs(s.depthM - depthM);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * Convert depth curve + GeoTOP column into validation rows.
 * electrodeDiameterMm defaults to 14 mm if unknown (matches common EarthGND rod).
 */
export function buildGeotopValidationRows(args: {
  metingId: string;
  electrodeNo: number | null;
  lat: number | null;
  lon: number | null;
  siteClusterId: string;
  depthCurve: DepthCurvePoint[];
  geotopColumn: GeotopColumnSample[] | null;
  electrodeDiameterMm?: number;
}): GeotopValidationRow[] {
  const {
    metingId,
    electrodeNo,
    lat,
    lon,
    siteClusterId,
    depthCurve,
    geotopColumn,
    electrodeDiameterMm = 14,
  } = args;

  if (lat == null || lon == null) {
    return [];
  }

  if (!geotopColumn || geotopColumn.length === 0) {
    return [];
  }

  const d_m = mmToRodDiameterM(electrodeDiameterMm);
  const rows: GeotopValidationRow[] = [];

  for (const pt of depthCurve) {
    if (!(pt.depth_m > 0) || !(pt.ra_ohm > 0)) continue;
    const rho = deriveRhoApparent(pt.ra_ohm, pt.depth_m, d_m);
    if (!(rho > 0) || !Number.isFinite(rho)) continue;

    const geo = geotopAtDepth(geotopColumn, pt.depth_m);
    if (!geo) continue;

    const dist = mapGeotopToEarthGndDist(geo.geotopKlas);
    const earthClass = dominantEarthGndClass(dist);
    const prior = LITERATURE_PRIOR[earthClass] ?? LITERATURE_PRIOR[3]!;
    const rel = relativeErrorPct(prior.mu, rho);
    // Compare empirical rho to theoretical mu of the GeoTOP-mapped class
    const abs = absoluteError(prior.mu, rho);
    const agree = agreementFromRelativeErrorPct(rel);

    rows.push({
      metingId,
      electrodeNo,
      lat,
      lon,
      siteClusterId,
      depthM: pt.depth_m,
      measuredRaOhm: pt.ra_ohm,
      empiricalRhoOhmM: rho,
      geotopRawLithology: geotopRawLabel(geo.geotopKlas),
      geotopKlas: geo.geotopKlas,
      geotopProbability: geo.probability,
      earthgndLithoClass: earthClass,
      earthgndClassDist: Object.fromEntries(
        Object.entries(dist).map(([k, v]) => [k, v ?? 0]),
      ),
      theoreticalMu: prior.mu,
      theoreticalSigma: prior.sigma,
      absoluteError: abs,
      relativeErrorPct: rel,
      agreementScore: agree,
      sourceVersion: GEOTOP.version,
      exclusionReason: null,
    });
  }

  return rows;
}

/** Convert GeoTOP provider column (NAP-based) to depth-below-maaiveld samples. */
export function columnToDepthSamples(
  maaiveldNAP: number,
  column: { topNAP: number; botNAP: number; lithok: number; kans: number | null }[],
): GeotopColumnSample[] {
  return column.map(c => {
    const midNAP = (c.topNAP + c.botNAP) / 2;
    const depthM = maaiveldNAP - midNAP;
    return {
      depthM,
      geotopKlas: c.lithok,
      probability: c.kans,
    };
  });
}
