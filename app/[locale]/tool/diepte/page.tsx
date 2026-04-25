import { DiepteCalculator } from '@/components/tools/DiepteCalculator';

export const metadata = {
  title: 'Penlengtte Calculator — EarthGND',
  description: 'Bereken de benodigde aardpenlengtte op basis van grondweerstand, grondwater en pH volgens de Dwight-formule.',
};

export default function DieptePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
            📐 Dwight-formule · NEN 1010 · NEN 62305
          </div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            Penlengtte Calculator
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Bereken de minimale aardpenlengtte voor uw gewenste aardingsweerstand op basis van de grondgesteldheid.
          </p>
        </div>
        <DiepteCalculator />
      </div>
    </div>
  );
}
