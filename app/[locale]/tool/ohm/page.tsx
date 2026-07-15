import { OhmCalculator } from '@/components/tools/OhmCalculator';
import { PageMeta } from '@/components/ui/FieldLabel';

export const metadata = {
  title: 'Weerstand Calculator — EarthGND',
  description: 'Bereken de maximale aardingsweerstand per NEN 1010, NEN 62305 en NEN 50522. Gratis, geen account vereist.',
};

export default function OhmPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <PageMeta>NEN 1010 · NEN 62305 · NEN 50522</PageMeta>
          <h1 className="font-condensed text-3xl font-black text-white sm:text-4xl">
            Weerstand Calculator
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Maximale aardingsweerstand — gratis, geen account vereist.
          </p>
        </div>
        <OhmCalculator />
      </div>
    </div>
  );
}
