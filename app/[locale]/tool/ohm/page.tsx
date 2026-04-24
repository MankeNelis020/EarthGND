import { OhmCalculator } from '@/components/tools/OhmCalculator';

export const metadata = {
  title: 'Ohm Calculator — EarthGND',
  description: 'Bereken de maximale aardingsweerstand stap voor stap op basis van NEN 1010, NEN 62305 en NEN 50522.',
};

export default function OhmPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
            ⚡ NEN 1010 · NEN 62305 · NEN 50522
          </div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            Aardingsweerstand Calculator
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Begeleid u stap voor stap naar de maximale aardingsweerstand voor uw specifieke situatie.
          </p>
        </div>
        <OhmCalculator />
      </div>
    </div>
  );
}
