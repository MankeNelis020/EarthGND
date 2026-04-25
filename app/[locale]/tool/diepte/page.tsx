import { EarthGndTool } from '@/components/tools/EarthGndTool';

export default function DieptePage() {
  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-black text-white sm:text-3xl">Aardpen Diepte Tool</h1>
        <EarthGndTool mode="diepte" />
      </div>
    </div>
  );
}
