import { DiepteCalculator } from '@/components/tools/DiepteCalculator';

export const metadata = {
  title: 'Pendiepte Calculator — EarthGND',
  description: 'Bereken de benodigde aardpenlengtte op basis van BRO bodemdata, grondwater en pH. Inclusief risicoklasse I–IV.',
};

export default function DieptePage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-3 py-1 text-xs font-semibold tracking-wider text-[#E8761A]">
            Dwight-formule · BRO bodemdata · NEN 3140
          </div>
          <h1 className="font-condensed text-3xl font-black text-white sm:text-4xl">
            Pendiepte Calculator
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Exacte penlengtte op basis van uw locatie en bodemgesteldheid.
          </p>
        </div>
        <DiepteCalculator />
      </div>
    </div>
  );
}
