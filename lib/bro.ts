import { lithoClassToRho } from './calculations';

export interface BroDepthSample {
  depth: number;
  lithoClass: number;
  rho: number;
}

export interface BroResult {
  samples: BroDepthSample[];
  dominantRho: number;
  dominantLithoClass: number;
  hasData: boolean;
  estimatedPh: number;
}

const BRO_DEPTHS = [-1, -3, -5, -10, -20];

function parseLithoClass(description: string): number {
  const lower = description.toLowerCase();
  if (lower.includes('veen') || lower.includes('peat')) return 5;
  if (lower.includes('klei') || lower.includes('clay')) return 3;
  if (lower.includes('leem') || lower.includes('loam')) return 3;
  if (lower.includes('fijn zand') || lower.includes('fine sand')) return 2;
  if (lower.includes('zand') || lower.includes('sand')) return 2;
  if (lower.includes('grind') || lower.includes('gravel')) return 1;
  if (lower.includes('steen') || lower.includes('rock')) return 6;
  return 3;
}

function estimatePh(lithoClass: number): number {
  if (lithoClass === 5) return 4.8;
  if (lithoClass === 2) return 5.8;
  if (lithoClass === 1) return 7.4;
  if (lithoClass === 6) return 7.6;
  return 6.6;
}

export async function fetchBroSoilData(rdX: number, rdY: number, mode: 'free' | 'pro' = 'pro'): Promise<BroResult> {
  const samples: BroDepthSample[] = [];

  const baseX = mode === 'free' ? Math.round(rdX / 500) * 500 : rdX;
  const baseY = mode === 'free' ? Math.round(rdY / 500) * 500 : rdY;

  for (const depth of BRO_DEPTHS) {
    try {
      const url = `https://publiek.broservices.nl/sr/cpt/v1/objects?bbox=${baseX - 500},${baseY - 500},${baseX + 500},${baseY + 500}&observedProperty=soilclass&depth=${depth}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const data = await res.json();
      const feature = data?.features?.[0];
      const lithoDesc: string = feature?.properties?.soilclass ?? '';
      if (!lithoDesc) continue;

      const lithoClass = parseLithoClass(lithoDesc);
      samples.push({ depth, lithoClass, rho: lithoClassToRho(lithoClass) });
    } catch {
      // handled via fallback below
    }
  }

  if (samples.length === 0) {
    return {
      samples: [],
      dominantRho: 125,
      dominantLithoClass: 3,
      hasData: false,
      estimatedPh: 6.6,
    };
  }

  const classCounts: Record<number, number> = {};
  samples.forEach((s) => {
    classCounts[s.lithoClass] = (classCounts[s.lithoClass] ?? 0) + 1;
  });

  const dominantLithoClass = Number(Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0][0]);
  const dominantRho = lithoClassToRho(dominantLithoClass);

  return {
    samples,
    dominantRho,
    dominantLithoClass,
    hasData: true,
    estimatedPh: estimatePh(dominantLithoClass),
  };
}
