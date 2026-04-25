import { Link } from '@/i18n/navigation';

function Check() {
  return (
    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E8761A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const FEATURES_FREE = [
  'Weerstand Calculator onbeperkt',
  'TT- en TN-stelsel',
  'NEN 1010 normen',
  'Geen account nodig',
];

const FEATURES_PAID = [
  'BRO bodemdata per postcode',
  'Risicoklasse I – IV',
  'Drie berekende scenario\'s',
  'PDF rapport',
  'Grondwater & pH correcties',
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d]">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pb-24 pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,118,26,0.12),transparent)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-4 py-1.5 text-xs font-semibold tracking-wider text-[#E8761A]">
            NEN 1010 · NEN 62305 · NEN 50522
          </div>
          <h1 className="font-condensed mb-6 text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-7xl">
            Aardingsweerstand.<br />
            <span className="text-[#E8761A]">Direct bepaald.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/55">
            Twee professionele calculators voor elektrotechnici en aannemers. Van maximale aardingsweerstand tot exacte pendiepte — onderbouwd met BRO bodemdata.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/tool/ohm"
              className="rounded-xl bg-[#E8761A] px-8 py-3.5 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
            >
              Weerstand berekenen — gratis
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/15 px-8 py-3.5 text-sm font-semibold text-white/70 hover:border-white/30 hover:text-white transition-colors"
            >
              Bekijk tarieven
            </Link>
          </div>
        </div>
      </section>

      {/* ── Product cards ─────────────────────────────────────────────────── */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl grid gap-4 md:grid-cols-2">

          {/* Card 1: Weerstand Calculator — free */}
          <div className="flex flex-col rounded-2xl border border-white/8 bg-[#111] p-7">
            <div className="mb-5 flex items-center justify-between">
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400">
                Altijd gratis
              </span>
            </div>
            <h2 className="font-condensed mb-2 text-2xl font-black text-white">Weerstand Calculator</h2>
            <p className="mb-6 text-sm leading-relaxed text-white/55">
              Bereken de maximale aardingsweerstand per NEN 1010. Kies je stelsel, installatietype en aardlekschakelaar — krijg direct vier outputlagen: wettelijk maximum, praktisch maximum, ontwerpdoel en streefwaarde.
            </p>
            <ul className="mb-8 flex flex-col gap-2">
              {FEATURES_FREE.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <Link
                href="/tool/ohm"
                className="block w-full rounded-xl border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-[#E8761A]/50 hover:text-[#E8761A] transition-colors"
              >
                Open calculator
              </Link>
            </div>
          </div>

          {/* Card 2: Pendiepte Calculator — paid */}
          <div className="flex flex-col rounded-2xl border border-[#E8761A]/25 bg-gradient-to-b from-[#E8761A]/8 to-[#111] p-7">
            <div className="mb-5 flex items-center justify-between">
              <span className="rounded-full border border-[#E8761A]/30 bg-[#E8761A]/10 px-2.5 py-1 text-xs font-semibold text-[#E8761A]">
                Vanaf 10/mnd
              </span>
              <span className="text-xs text-white/30">of 2,95 per berekening</span>
            </div>
            <h2 className="font-condensed mb-2 text-2xl font-black text-white">Pendiepte Calculator</h2>
            <p className="mb-6 text-sm leading-relaxed text-white/55">
              Voer een postcode in. EarthGND haalt automatisch grondsoort, grondwaterstand en pH op via het BRO — en berekent hoe diep de aardpen moet. Inclusief risicoklasse I t/m IV.
            </p>
            <ul className="mb-8 flex flex-col gap-2">
              {FEATURES_PAID.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <Link
                href="/pricing"
                className="block w-full rounded-xl bg-[#E8761A] py-3 text-center text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
              >
                Bekijk tarieven
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Three pillars ─────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 px-4 py-16">
        <div className="mx-auto max-w-5xl grid gap-px grid-cols-1 overflow-hidden rounded-2xl border border-white/8 sm:grid-cols-3">
          {[
            { title: 'BRO Bodemdata', desc: 'Grondsoort, grondwaterstand en pH rechtstreeks uit het Basis Registratie Ondergrond op postcode.' },
            { title: 'NEN 1010 normen', desc: 'Alle berekeningen conform NEN 1010, NEN 62305 en NEN 50522 — inclusief wettelijk maximum.' },
            { title: 'Indicatief rapport', desc: 'Exporteer een onderbouwde PDF met invoerwaarden, formule en risicoklasse voor uw dossier.' },
          ].map((item) => (
            <div key={item.title} className="bg-[#111] px-7 py-8">
              <p className="font-condensed mb-2 text-lg font-bold text-white">{item.title}</p>
              <p className="text-sm leading-relaxed text-white/45">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
