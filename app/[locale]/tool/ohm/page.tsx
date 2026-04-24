import { EarthGndTool } from '@/components/tools/EarthGndTool';

export const metadata = {
  title: 'Ohm Calculator — EarthGND',
  description: 'Herziene aardingsweerstand tool met postcode-koppeling.',
};

export default function OhmPage() {
  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-black text-white sm:text-3xl">Aardingsweerstand Tool (Ohm)</h1>
        <EarthGndTool mode="ohm" />
      </div>
    </div>
  );
}
