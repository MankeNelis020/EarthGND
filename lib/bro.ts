import { lithoClassToRho } from './calculations';

export interface BroDepthSample {
  depth: number;
  lithoClass: number;
  rho: number;
}

export interface BroResult {
  samples: BroDepthSample[];
  dominantRho: number;
}

const BRO_DEPTHS = [-1, -3, -5, -10, -20];

// Map lithoClass description keywords to class numbers (simplified)
function parseLithoClass(description: string): number {
  const lower = description.toLowerCase();
  if (lower.includes('veen') || lower.includes('peat')) return 5;
  if (lower.includes('klei') || lower.includes('clay')) return 3;
  if (lower.includes('leem') || lower.includes('loam')) return 3;
  if (lower.includes('fijn zand') || lower.includes('fine sand')) return 2;
  if (lower.includes('zand') || lower.includes('sand')) return 2;
  if (lower.includes('grind') || lower.includes('gravel')) return 1;
  if (lower.includes('steen') || lower.includes('rock')) return 6;
  return 3; // default: loam
}

export async function fetchBroSoilData(rdX: number, rdY: number): Promise<BroResult> {
  const samples: BroDepthSample[] = [];

  for (const depth of BRO_DEPTHS) {
    try {
      const url = `https://publiek.broservices.nl/sr/cpt/v1/objects?bbox=${rdX - 500},${rdY - 500},${rdX + 500},${rdY + 500}&observedProperty=soilclass&depth=${depth}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!res.ok) {
        samples.push({ depth, lithoClass: 3, rho: lithoClassToRho(3) });
        continue;
      }

      const data = await res.json();
      const feature = data?.features?.[0];
      const lithoDesc: string = feature?.properties?.soilclass ?? '';
      const lithoClass = lithoDesc ? parseLithoClass(lithoDesc) : 3;

      samples.push({ depth, lithoClass, rho: lithoClassToRho(lithoClass) });
    } catch {
      samples.push({ depth, lithoClass: 3, rho: lithoClassToRho(3) });
    }
  }

  // Use dominant rho (most common) as the representative value
  const rhoCounts: Record<number, number> = {};
  samples.forEach((s) => {
    rhoCounts[s.rho] = (rhoCounts[s.rho] ?? 0) + 1;
  });
  const dominantRho = parseInt(
    Object.entries(rhoCounts).sort((a, b) => b[1] - a[1])[0][0]
  );

  return { samples, dominantRho };
}
