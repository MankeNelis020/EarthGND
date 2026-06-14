import { lithoClassToRho } from './calculations';

export interface BroDepthSample {
  depth: number;
  lithoClass: number;
  rho: number;
}

export interface BroResult {
  samples: BroDepthSample[];
  dominantRho: number;
  groundwaterDepth: number | null;
  source: 'bro' | 'fallback';
  dataSource?: 'cpt' | 'bhrgt'; // which BRO source was used
  straatnaam?: string;
  huisnummer?: string;
  woonplaats?: string;
}

// Depths to sample (positive metres from surface)
const BRO_DEPTHS = [1, 3, 5, 10, 20];

// ─── CPT (sondering) ──────────────────────────────────────────────────────────

// Robertson (1990): qc (MPa) → lithoClass → ρ
function qcToLithoClass(qc: number): number {
  if (qc < 0.3) return 5;  // peat / very soft organic
  if (qc < 2.0) return 1;  // soft clay
  if (qc < 5.0) return 2;  // silt / sandy clay
  if (qc < 20.0) return 3; // sand / silty sand
  return 4;                 // dense sand / gravel
}

async function fetchBroCptSamples(lat: number, lon: number): Promise<BroDepthSample[] | null> {
  try {
    const searchRes = await fetch('https://publiek.broservices.nl/sr/cpt/v1/characteristics/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestReference: 'earthgnd',
        area: { enclosingCircle: { center: { lat, lon }, radius: 0.5 } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return null;

    const searchXml = await searchRes.text();
    const idMatches = searchXml.match(/<brocom:broId>(CPT[^<]+)<\/brocom:broId>/g) ?? [];
    const ids = idMatches.map((m) => m.replace(/<\/?brocom:broId>/g, ''));
    if (!ids.length) return null;

    for (const id of ids.slice(0, 3)) {
      try {
        const cptRes = await fetch(`https://publiek.broservices.nl/sr/cpt/v1/objects/${id}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!cptRes.ok) continue;

        const cptXml = await cptRes.text();
        const valuesMatch = cptXml.match(/<cptcommon:values>([^<]+)<\/cptcommon:values>/);
        if (!valuesMatch) continue;

        const rows = valuesMatch[1]
          .trim()
          .split(';')
          .map((r) => r.split(','))
          .filter((r) => r.length > 4);

        if (!rows.length) continue;

        const firstDepth = parseFloat(rows[0][1]);
        if (isNaN(firstDepth) || firstDepth > 3) continue;

        return BRO_DEPTHS.map((targetDepth) => {
          const best = rows.reduce((prev, cur) => {
            const pd = parseFloat(prev[1]);
            const cd = parseFloat(cur[1]);
            return Math.abs(cd - targetDepth) < Math.abs(pd - targetDepth) ? cur : prev;
          });
          const qc = parseFloat(best[3]);
          const lithoClass = isNaN(qc) || qc <= -999 ? 3 : qcToLithoClass(qc);
          return { depth: -targetDepth, lithoClass, rho: lithoClassToRho(lithoClass) };
        });
      } catch {
        continue;
      }
    }
  } catch {
    // timeout or network error
  }
  return null;
}

// ─── BHR-GT (geotechnische boringen) ─────────────────────────────────────────
// Much better national coverage than CPT; used as fallback when no CPT nearby.

// Map BHR-GT sizeFraction + organicMatterContentClass → lithoClass
function bhrgtLayerToLithoClass(sizeFraction: string, organicClass: string): number {
  // Strongly organic → peat regardless of main fraction
  if (['sterkOrganisch', 'detritus', 'organisch'].includes(organicClass)) return 5;

  switch (sizeFraction.toLowerCase()) {
    case 'veen':  return 5; // peat (2000 Ω·m)
    case 'klei':  return 1; // clay (30 Ω·m)
    case 'leem':  return 2; // loam/silt (60 Ω·m)
    case 'silt':  return 2; // silt (60 Ω·m)
    case 'zand':  return 3; // sand (125 Ω·m)
    case 'grind': return 4; // gravel/dense (300 Ω·m)
    default:      return 3; // unknown → sand as neutral default
  }
}

// Tries progressively larger radii (2 → 5 → 10 km) so rural areas are covered.
// Returns null only when no usable boring exists within 10 km.
async function fetchBhrGtSamples(lat: number, lon: number): Promise<BroDepthSample[] | null> {
  for (const radius of [2, 5, 10]) {
    const result = await tryBhrGtAtRadius(lat, lon, radius);
    if (result) return result;
  }
  return null;
}

async function tryBhrGtAtRadius(lat: number, lon: number, radius: number): Promise<BroDepthSample[] | null> {
  try {
    const searchRes = await fetch('https://publiek.broservices.nl/sr/bhrgt/v2/characteristics/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestReference: 'earthgnd',
        area: { enclosingCircle: { center: { lat, lon }, radius } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return null;

    const searchXml = await searchRes.text();
    const idMatches = searchXml.match(/<brocom:broId>(BHR[^<]+)<\/brocom:broId>/g) ?? [];
    const ids = idMatches.map((m) => m.replace(/<\/?brocom:broId>/g, ''));
    if (!ids.length) return null;

    for (const id of ids.slice(0, 3)) {
      try {
        const bhrRes = await fetch(`https://publiek.broservices.nl/sr/bhrgt/v2/objects/${id}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!bhrRes.ok) continue;

        const bhrXml = await bhrRes.text();
        const layerXmls = bhrXml.match(/<bhrgtcom:layer>([\s\S]*?)<\/bhrgtcom:layer>/g) ?? [];
        if (!layerXmls.length) continue;

        interface BhrLayer {
          upperBoundary: number;
          lowerBoundary: number;
          lithoClass: number;
          rho: number;
        }

        const layers: BhrLayer[] = layerXmls
          .map((lxml) => {
            const ub = parseFloat(lxml.match(/<bhrgtcom:upperBoundary[^>]*>([^<]+)/)?.[1] ?? 'NaN');
            const lb = parseFloat(lxml.match(/<bhrgtcom:lowerBoundary[^>]*>([^<]+)/)?.[1] ?? 'NaN');
            const sizeFraction = lxml.match(/<bhrgtcom:sizeFraction[^>]*>([^<]+)/)?.[1] ?? '';
            const organicClass = lxml.match(/<bhrgtcom:organicMatterContentClass[^>]*>([^<]+)/)?.[1] ?? '';
            const lithoClass = bhrgtLayerToLithoClass(sizeFraction, organicClass);
            return { upperBoundary: ub, lowerBoundary: lb, lithoClass, rho: lithoClassToRho(lithoClass) };
          })
          .filter((l) => !isNaN(l.upperBoundary) && !isNaN(l.lowerBoundary));

        if (!layers.length) continue;

        const lastLayer = layers[layers.length - 1];
        return BRO_DEPTHS.map((targetDepth) => {
          const layer =
            layers.find((l) => l.upperBoundary <= targetDepth && targetDepth < l.lowerBoundary) ??
            lastLayer;
          return { depth: -targetDepth, lithoClass: layer.lithoClass, rho: layer.rho };
        });
      } catch {
        continue;
      }
    }
  } catch {
    // timeout or network error at this radius
  }
  return null;
}

// ─── Groundwater ──────────────────────────────────────────────────────────────

async function fetchGroundwaterDepth(rdX: number, rdY: number): Promise<number | null> {
  const margin = 1000;
  try {
    const url = `https://api.pdok.nl/tno/bro-grondwatermonitoring-in-samenhang-karakteristieken/ogc/v1/collections/gm_gmw_monitoringtube/items?f=json&bbox=${rdX - margin},${rdY - margin},${rdX + margin},${rdY + margin}&bbox-crs=http://www.opengis.net/def/crs/EPSG/0/28992&limit=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();

    const depths: number[] = (data?.features ?? [])
      .map((f: { properties?: { screen_top_position?: number } }) => f.properties?.screen_top_position)
      .filter((v: unknown): v is number => typeof v === 'number' && isFinite(v) && v < 0)
      .map((v: number) => Math.abs(v));

    if (!depths.length) return null;
    depths.sort((a, b) => a - b);
    return depths[Math.floor(depths.length / 2)];
  } catch {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchBroSoilData(
  rdX: number,
  rdY: number,
  lat: number,
  lon: number,
): Promise<BroResult> {
  // Run CPT, BHR-GT and groundwater in parallel; CPT is preferred when available
  const [cptSamples, bhrgtSamples, groundwaterDepth] = await Promise.all([
    fetchBroCptSamples(lat, lon),
    fetchBhrGtSamples(lat, lon),
    fetchGroundwaterDepth(rdX, rdY),
  ]);

  const samples = cptSamples ?? bhrgtSamples;
  const dataSource: 'cpt' | 'bhrgt' | undefined = cptSamples
    ? 'cpt'
    : bhrgtSamples
    ? 'bhrgt'
    : undefined;

  if (!samples) {
    const fallbackSamples = BRO_DEPTHS.map((d) => ({
      depth: -d,
      lithoClass: 3,
      rho: lithoClassToRho(3),
    }));
    return { samples: fallbackSamples, dominantRho: 125, groundwaterDepth, source: 'fallback' };
  }

  const rhoCounts: Record<number, number> = {};
  samples.forEach((s) => {
    rhoCounts[s.rho] = (rhoCounts[s.rho] ?? 0) + 1;
  });
  const dominantRho = parseInt(Object.entries(rhoCounts).sort((a, b) => b[1] - a[1])[0][0]);

  return { samples, dominantRho, groundwaterDepth, source: 'bro', dataSource };
}
