import { lithoClassToRho } from './calculations';

export interface BroDepthSample {
  depth: number;
  lithoClass: number;
  rho: number;
}

export interface BroResult {
  samples: BroDepthSample[];
  dominantRho: number;
  groundwaterDepth: number | null; // metres below surface, null if unknown
  source: 'bro' | 'fallback';
  // Address confirmation from PDOK (optional, only when fetched by postcode)
  straatnaam?: string;
  huisnummer?: string;
  woonplaats?: string;
}

const BRO_DEPTHS = [1, 3, 5, 10, 20]; // positive metres from surface

// Robertson (1990) soil classification: qc → lithoClass → ρ
// lithoClass matches LITHO_CLASS_TO_RHO: 1=30Ω·m(clay), 2=60(silt), 3=125(sand), 4=300(dense), 5=2000(peat)
function qcToLithoClass(qc: number): number {
  if (qc < 0.3) return 5;   // peat / very soft organic
  if (qc < 2.0) return 1;   // soft clay / clay
  if (qc < 5.0) return 2;   // silty clay / sandy clay
  if (qc < 20.0) return 3;  // sand / silty sand
  return 4;                  // dense sand / gravel
}

// Fetch BRO CPT soil data near a lat/lon point
// Step 1: POST to characteristics/searches → get nearby CPT IDs
// Step 2: GET individual CPT object → parse qc values → Robertson classification
async function fetchBroCptSamples(lat: number, lon: number): Promise<BroDepthSample[] | null> {
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

  // Try up to 3 CPTs, pick the first that covers shallow depths (starts < 3m)
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

      // Skip CPTs that don't have shallow coverage (start > 3m depth)
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

  return null;
}

// Fetch groundwater depth from PDOK BRO monitoring wells
// Uses screen_top_position as proxy for GHG (gemiddeld hoogste grondwaterstand)
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
    return depths[Math.floor(depths.length / 2)]; // median
  } catch {
    return null;
  }
}

export async function fetchBroSoilData(
  rdX: number,
  rdY: number,
  lat: number,
  lon: number,
): Promise<BroResult> {
  const [samples, groundwaterDepth] = await Promise.all([
    fetchBroCptSamples(lat, lon),
    fetchGroundwaterDepth(rdX, rdY),
  ]);

  if (!samples) {
    // Fallback: all depths → lithoClass 3 (sand, 125 Ω·m)
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

  return { samples, dominantRho, groundwaterDepth, source: 'bro' };
}
