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
}

const BRO_DEPTHS = [-1, -3, -5, -10, -20];

// Keyword → lithoClass mapping for Dutch soil descriptions
function parseLithoClass(description: string): number {
  const lower = description.toLowerCase();
  if (lower.includes('veen') || lower.includes('peat'))                    return 5;
  if (lower.includes('klei') || lower.includes('clay'))                   return 3;
  if (lower.includes('leem') || lower.includes('loam'))                   return 3;
  if (lower.includes('fijn zand') || lower.includes('fine sand'))         return 2;
  if (lower.includes('zand') || lower.includes('sand'))                   return 2;
  if (lower.includes('grind') || lower.includes('gravel'))                return 1;
  if (lower.includes('steen') || lower.includes('rock') || lower.includes('rots')) return 6;
  return 3;
}

// Try one BRO CPT depth call — returns lithoClass or null on failure
async function tryBroDepth(rdX: number, rdY: number, depth: number): Promise<number | null> {
  const margin = 500;
  const url = `https://publiek.broservices.nl/sr/cpt/v1/objects?bbox=${rdX - margin},${rdY - margin},${rdX + margin},${rdY + margin}&observedProperty=soilclass&depth=${depth}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const desc: string = data?.features?.[0]?.properties?.soilclass ?? '';
    return desc ? parseLithoClass(desc) : null;
  } catch {
    return null;
  }
}

// Try BRO groundwater wells (GMW) near a point
async function tryBroGroundwater(rdX: number, rdY: number): Promise<number | null> {
  const margin = 1000;
  try {
    const url = `https://publiek.broservices.nl/gm/gmw/v1/objects?bbox=${rdX - margin},${rdY - margin},${rdX + margin},${rdY + margin}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    // groundwater depth from well head elevation + tube length (rough estimate)
    const feature = data?.features?.[0];
    const groundLevel: number | undefined = feature?.properties?.groundLevelPosition;
    const tubeTop: number | undefined = feature?.properties?.tubes?.[0]?.screenTopPosition;
    if (groundLevel != null && tubeTop != null) {
      return Math.abs(groundLevel - tubeTop);
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchBroSoilData(rdX: number, rdY: number): Promise<BroResult> {
  // Run BRO depth calls in parallel, any that fail return default lithoClass 3
  const results = await Promise.all(
    BRO_DEPTHS.map((d) => tryBroDepth(rdX, rdY, d))
  );

  const samples: BroDepthSample[] = BRO_DEPTHS.map((depth, i) => {
    const lithoClass = results[i] ?? 3;
    return { depth, lithoClass, rho: lithoClassToRho(lithoClass) };
  });

  const allFailed = results.every((r) => r === null);

  // Dominant rho = most frequent value
  const rhoCounts: Record<number, number> = {};
  samples.forEach((s) => { rhoCounts[s.rho] = (rhoCounts[s.rho] ?? 0) + 1; });
  const dominantRho = parseInt(
    Object.entries(rhoCounts).sort((a, b) => b[1] - a[1])[0][0]
  );

  const groundwaterDepth = await tryBroGroundwater(rdX, rdY);

  return {
    samples,
    dominantRho,
    groundwaterDepth,
    source: allFailed ? 'fallback' : 'bro',
  };
}
