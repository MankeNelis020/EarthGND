import { Link } from '@/i18n/navigation';

export const metadata = {
  title: 'Voorbeeldberekening Pendiepte — EarthGND',
  description: 'Zie hoe EarthGND de benodigde aardpendiepte berekent: BRO bodemdata, drie scenario\'s en NEN 1010 risicoklasse — zonder in te loggen.',
};

function RiskBadge({ level }: { level: 'I' | 'II' | 'III' | 'IV' }) {
  const colors: Record<string, string> = {
    I:   'border-green-500/30 bg-green-500/10 text-green-400',
    II:  'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    III: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
    IV:  'border-red-500/30 bg-red-500/10 text-red-400',
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${colors[level]}`}>
      Risicoklasse {level}
    </span>
  );
}

function ScenarioBar({ label, depth, resistance, color, widthClass }: {
  label: string; depth: string; resistance: string; color: string; widthClass: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 shrink-0 text-right text-xs text-white/40">{label}</div>
      <div className="flex-1">
        <div className={`h-6 rounded-md ${color} ${widthClass} flex items-center px-3`}>
          <span className="text-xs font-semibold text-white">{depth}</span>
        </div>
      </div>
      <div className="w-16 shrink-0 text-xs text-white/40">{resistance}</div>
    </div>
  );
}

export default function PendiepteShowcasePage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-16">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E8761A]/25 bg-[#E8761A]/8 px-4 py-1.5 text-xs font-semibold tracking-wider text-[#E8761A]">
          Voorbeeldberekening
        </div>
        <h1 className="font-condensed mb-3 text-4xl font-black text-white sm:text-5xl">
          Pendiepte berekening<br />
          <span className="text-[#E8761A]">stap voor stap</span>
        </h1>
        <p className="mb-12 max-w-xl text-base leading-relaxed text-white/50">
          Dit is een realistische berekening op basis van BRO bodemdata. Geen fictieve getallen —
          de waarden zijn representatief voor klei-bodem in het westen van Nederland.
        </p>

        {/* Step 1: Input */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111] p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="font-condensed text-2xl font-black text-[#E8761A]/40">01</span>
            <h2 className="font-condensed text-xl font-bold text-white">Invoer</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Postcode', value: '2512 HM', note: 'Den Haag centrum' },
              { label: 'Doelweerstand', value: '≤ 10 Ω', note: 'NEN 1010 installatie' },
              { label: 'Elektrodetype', value: 'Aardpen (pen)', note: 'Ø 14 mm koper' },
            ].map(({ label, value, note }) => (
              <div key={label} className="rounded-xl bg-white/3 px-4 py-3">
                <p className="mb-0.5 text-xs text-white/30">{label}</p>
                <p className="font-condensed text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-white/30">{note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: BRO data */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111] p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="font-condensed text-2xl font-black text-[#E8761A]/40">02</span>
            <h2 className="font-condensed text-xl font-bold text-white">BRO Bodemdata</h2>
          </div>
          <p className="mb-5 text-sm text-white/40">
            EarthGND haalt automatisch de bodemgegevens op uit het Basis Registratie Ondergrond.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Grondsoort', value: 'Klei/nat', sub: 'Holoceen' },
              { label: 'Soortelijke weerstand', value: 'ρ = 28 Ω·m', sub: 'gemeten BRO' },
              { label: 'Grondwaterstand', value: '0,9 m –mv', sub: 'hoog GWT' },
              { label: 'pH bodem', value: '7,1', sub: 'laag corrosierisico' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl bg-white/3 px-4 py-3">
                <p className="mb-0.5 text-xs text-white/30">{label}</p>
                <p className="text-sm font-semibold text-white">{value}</p>
                <p className="text-xs text-white/25">{sub}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-green-500/15 bg-green-500/5 px-4 py-3 text-xs text-green-400">
            Klei met hoog grondwater is gunstig voor aarding — lage weerstand, goede geleidbaarheid.
          </div>
        </div>

        {/* Step 3: Scenarios */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-[#111] p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-condensed text-2xl font-black text-[#E8761A]/40">03</span>
              <h2 className="font-condensed text-xl font-bold text-white">Berekende scenario&apos;s</h2>
            </div>
            <RiskBadge level="II" />
          </div>
          <p className="mb-6 text-sm text-white/40">
            Drie scenario&apos;s op basis van de spreiding in BRO-data. De Dwight-formule berekent per
            diepte de bijbehorende Ra-weerstand.
          </p>

          {/* Bar chart */}
          <div className="mb-6 flex flex-col gap-4">
            <div className="flex items-center gap-4 text-xs text-white/25">
              <div className="w-24 text-right">Scenario</div>
              <div className="flex-1">Pendiepte (m)</div>
              <div className="w-16">Ra (Ω)</div>
            </div>
            <ScenarioBar label="Gunstig" depth="1,8 m" resistance="8,4 Ω" color="bg-green-600" widthClass="w-[30%]" />
            <ScenarioBar label="Gemiddeld" depth="2,6 m" resistance="9,7 Ω" color="bg-[#E8761A]" widthClass="w-[43%]" />
            <ScenarioBar label="Ongunstig" depth="4,2 m" resistance="9,9 Ω" color="bg-red-700" widthClass="w-[70%]" />
          </div>

          <div className="rounded-xl border border-[#E8761A]/20 bg-[#E8761A]/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-white">Advies: 1 pen, 2,6 m diep</p>
            <p className="text-xs leading-relaxed text-white/40">
              Het gemiddeld scenario voldoet met Ra = 9,7 Ω aan de doelweerstand van 10 Ω.
              Bij ongunstige bodemomstandigheden is 4,2 m nog altijd voldoende met één pen.
              Risicoklasse II — normale installatieomgeving.
            </p>
          </div>
        </div>

        {/* Step 4: Monteur + rapport */}
        <div className="mb-10 rounded-2xl border border-white/8 bg-[#111] p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="font-condensed text-2xl font-black text-[#E8761A]/40">04</span>
            <h2 className="font-condensed text-xl font-bold text-white">Van berekening naar rapport</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: '📧',
                title: 'Nodig monteur uit',
                desc: 'Stuur de taakopdracht per e-mail. Monteur krijgt de berekende pendiepte en doelweerstand mee.',
              },
              {
                icon: '📐',
                title: 'Veldmeting',
                desc: 'Monteur bevestigt de gemeten Ra op locatie. EarthGND archiveert gemeten vs. berekend.',
              },
              {
                icon: '✍️',
                title: 'Onderteken',
                desc: 'Genereer het NEN 1010 deel 6 opleverrapport. Digitaal ondertekend, klaar voor het dossier.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-xl bg-white/3 p-4">
                <div className="mb-2 text-2xl">{icon}</div>
                <p className="mb-1.5 text-sm font-semibold text-white">{title}</p>
                <p className="text-xs leading-relaxed text-white/40">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-[#E8761A]/20 bg-gradient-to-br from-[#E8761A]/8 to-transparent p-8 text-center">
          <p className="font-condensed mb-2 text-2xl font-black text-white">
            Klaar voor uw eigen project?
          </p>
          <p className="mb-6 text-sm text-white/45">
            Begin met de gratis Weerstand Calculator — geen account nodig.
            Upgrade naar Pendiepte voor BRO-data en opleverrapport.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/tool/ohm"
              className="rounded-xl border border-white/15 px-7 py-3 text-sm font-semibold text-white hover:border-[#E8761A]/50 hover:text-[#E8761A] transition-colors"
            >
              Weerstand Calculator — gratis
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl bg-[#E8761A] px-7 py-3 text-sm font-bold text-white hover:bg-[#d06510] transition-colors"
            >
              Aan de slag met Pendiepte
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-xs text-white/25 hover:text-white/50 transition-colors">
            ← Terug naar homepage
          </Link>
        </div>

      </div>
    </div>
  );
}
