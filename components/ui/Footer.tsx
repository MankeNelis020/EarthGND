import { Link } from '@/i18n/navigation';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/6 bg-[#111]">
      <div className="mx-auto max-w-4xl px-4 py-8">

        {/* Liability disclaimer — always visible */}
        <div className="mb-6 rounded-xl border border-yellow-500/15 bg-yellow-500/4 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-yellow-300/70">
            <strong className="font-semibold text-yellow-300/90">Disclaimer:</strong>{' '}
            EarthGND levert rekenkundige schattingen op basis van bodemmodellen en ingevoerde waarden.
            Resultaten zijn uitsluitend bedoeld als voorbereiding voor veldwerk door gecertificeerde professionals.
            Meet altijd ter plaatse na installatie conform NEN 3140. EarthGND is geen vervanging voor
            professioneel technisch advies en verleent geen NEN-conformiteitsverklaring.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-[#E8761A]">EarthGND</p>
            <p className="mt-0.5 text-xs text-white/30">Professionele aardingsberekeningen</p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/40">
            <Link href="/voorwaarden" className="hover:text-white/70 transition-colors">Algemene voorwaarden</Link>
            <Link href="/privacy"     className="hover:text-white/70 transition-colors">Privacybeleid</Link>
            <a href="mailto:info@earthgnd.com" className="hover:text-white/70 transition-colors">Contact</a>
          </nav>
        </div>

        <p className="mt-6 text-[11px] text-white/20">
          © {new Date().getFullYear()} EarthGND. Alle rechten voorbehouden.
          Gebruik van deze tool impliceert acceptatie van de algemene voorwaarden.
        </p>
      </div>
    </footer>
  );
}
