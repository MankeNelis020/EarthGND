export const metadata = {
  title: 'Algemene voorwaarden — EarthGND',
  description: 'Algemene voorwaarden voor het gebruik van EarthGND aardingsberekeningssoftware',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 text-base font-bold text-[#F5EFE6] first:mt-0">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-white/70">{children}</p>;
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="mb-1.5 text-sm leading-relaxed text-white/70">{children}</li>;
}

export default function VoorwaardenPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-12">

        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">EarthGND</p>
          <h1 className="mt-2 text-3xl font-black text-[#F5EFE6]">Algemene voorwaarden</h1>
          <p className="mt-2 text-xs text-white/40">Versie 1.0 · Ingangsdatum: 1 januari 2025</p>
        </div>

        {/* Important notice */}
        <div className="mb-8 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-4">
          <p className="text-sm font-semibold text-yellow-300">Belangrijk: schattingstool voor professionals</p>
          <p className="mt-1.5 text-xs leading-relaxed text-yellow-300/70">
            EarthGND levert rekenkundige schattingen. De software vervangt géén fysieke meting,
            géén professioneel technisch advies en verleent géén NEN-conformiteitsverklaring.
            Gebruik is uitsluitend voorbehouden aan gecertificeerde elektrotechnische professionals.
          </p>
        </div>

        <div className="prose-none">

          <H2>Artikel 1 — Definities</H2>
          <P>In deze voorwaarden wordt verstaan onder:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li><strong className="text-white/90">EarthGND:</strong> [BEDRIJFSNAAM], gevestigd te [ADRES], ingeschreven bij de Kamer van Koophandel onder nummer [KVK].</Li>
            <Li><strong className="text-white/90">De Dienst:</strong> de webapplicatie EarthGND, beschikbaar via earthgnd.com, inclusief de Pendiepte Calculator, Weerstand Calculator, monteurflow en opleverrapportmodule.</Li>
            <Li><strong className="text-white/90">Gebruiker:</strong> iedere natuurlijke of rechtspersoon die een account aanmaakt of de Dienst gebruikt.</Li>
            <Li><strong className="text-white/90">Berekening:</strong> een door de Dienst gegenereerde schatting van aardingsweerstand of pendiepte op basis van ingevoerde parameters en bodemmodellen.</Li>
            <Li><strong className="text-white/90">BRO-data:</strong> data afkomstig uit de publieke Basisregistratie Ondergrond van de Nederlandse overheid.</Li>
            <Li><strong className="text-white/90">Erkend professional:</strong> een gecertificeerd elektrotechnisch installateur of gelijkwaardig gekwalificeerd persoon bevoegd tot het uitvoeren van aardingswerkzaamheden conform de geldende NEN-normen.</Li>
          </ul>

          <H2>Artikel 2 — Toepasselijkheid</H2>
          <P>Deze voorwaarden zijn van toepassing op alle gebruik van de Dienst, alle aanbiedingen en alle overeenkomsten tussen EarthGND en de Gebruiker. Door de Dienst te gebruiken accepteert de Gebruiker deze voorwaarden volledig en onherroepelijk. Eventuele afwijkende voorwaarden van de Gebruiker worden uitdrukkelijk van de hand gewezen.</P>

          <H2>Artikel 3 — Aard en beperkingen van de Dienst</H2>
          <P>De Dienst biedt uitsluitend het volgende:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li>Rekenkundige schattingen van pendiepte en aardingsweerstand op basis van door de Gebruiker ingevoerde parameters en/of publiek beschikbare bodemdata (BRO).</Li>
            <Li>Een indicatief voorbereidingsinstrument voor gebruik voorafgaand aan veldwerk.</Li>
            <Li>Hulpmiddelen voor rapportage en communicatie tussen voorbereider en monteur.</Li>
          </ul>
          <P>De Dienst biedt uitdrukkelijk <strong className="text-white/90">niet</strong>:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li>Een vervanging voor fysieke meting ter plaatse na installatie, verplicht conform NEN 3140.</Li>
            <Li>Professioneel technisch advies of een ingenieursverklaring.</Li>
            <Li>Een NEN-conformiteitsverklaring of goedkeuring van installaties.</Li>
            <Li>Garantie dat berekende waarden overeenkomen met gemeten waarden ter plaatse.</Li>
            <Li>Zekerheid over de nauwkeurigheid van BRO-bodemdata op een specifieke locatie.</Li>
          </ul>
          <P>Berekeningen zijn modellenschattingen. De werkelijke aardingsweerstand is afhankelijk van lokale factoren (bodemheterogeniteit, seizoensgebonden grondwaterstand, aanlegkwaliteit) die niet volledig in een model kunnen worden gevat.</P>

          <H2>Artikel 4 — Gebruik uitsluitend door erkende professionals</H2>
          <P>De Dienst is uitsluitend bestemd voor gebruik door erkende elektrotechnische professionals met voldoende vakkennis om resultaten op juiste waarde te schatten, te interpreteren en te verifiëren. Het is de verantwoordelijkheid van de Gebruiker om:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li>te beschikken over de vereiste vakbekwaamheid en certificering;</Li>
            <Li>invoerwaarden te controleren op plausibiliteit;</Li>
            <Li>berekeningen te valideren met fysieke metingen conform NEN 3140;</Li>
            <Li>zelfstandig een professionele beoordeling te maken alvorens te handelen op basis van resultaten.</Li>
          </ul>
          <P>EarthGND behoudt zich het recht voor accounts te blokkeren waarvan vaststaat of vermoed wordt dat zij worden gebruikt door niet-gekwalificeerde personen.</P>

          <H2>Artikel 5 — Aansprakelijkheidsbeperking</H2>
          <P>EarthGND is een schattingsinstrument. Iedere beslissing die wordt genomen op basis van uitkomsten van de Dienst valt onder de professionele verantwoordelijkheid van de Gebruiker.</P>
          <P>EarthGND sluit — voor zover wettelijk toegestaan — iedere aansprakelijkheid uit voor:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li>schade als gevolg van onjuiste, onvolledige of verouderde BRO-data;</Li>
            <Li>schade als gevolg van afwijking tussen berekende en gemeten aardingsweerstand;</Li>
            <Li>schade door het niet (laten) uitvoeren van verplichte veldmetingen conform NEN 3140;</Li>
            <Li>schade door gebruik van de Dienst voor doeleinden waarvoor zij niet is bestemd;</Li>
            <Li>gevolgschade, indirecte schade, gederfde winst of reputatieschade;</Li>
            <Li>schade door tijdelijke onbeschikbaarheid van de Dienst of van externe databronnen (BRO, PDOK).</Li>
          </ul>
          <P>Indien EarthGND ondanks het voorgaande aansprakelijk mocht zijn, is die aansprakelijkheid te allen tijde beperkt tot het totaalbedrag dat de Gebruiker in de twaalf maanden voorafgaand aan de schadeveroorzakende gebeurtenis aan EarthGND heeft betaald, met een maximum van € 500,—.</P>

          <H2>Artikel 6 — Verplichtingen van de Gebruiker</H2>
          <P>De Gebruiker is verantwoordelijk voor de juistheid van ingevoerde gegevens. De Gebruiker mag de Dienst niet gebruiken voor:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li>activiteiten die in strijd zijn met Nederlands of Europees recht;</Li>
            <Li>het doorverkopen of sublicentiëren van de Dienst aan derden zonder schriftelijke toestemming;</Li>
            <Li>geautomatiseerde dataverzameling (scraping) of belasting van de infrastructuur.</Li>
          </ul>

          <H2>Artikel 7 — Beschikbaarheid en wijzigingen</H2>
          <P>EarthGND streeft naar een zo hoog mogelijke beschikbaarheid maar garandeert geen ononderbroken toegang. De Dienst kan worden gewijzigd, uitgebreid of (deels) beëindigd. EarthGND zal bij ingrijpende wijzigingen Gebruikers redelijk van tevoren informeren via e-mail.</P>

          <H2>Artikel 8 — Intellectueel eigendom</H2>
          <P>Alle intellectuele eigendomsrechten op de Dienst — waaronder de software, berekenmethoden, UI-ontwerp en documentatie — berusten bij EarthGND. De Gebruiker verkrijgt uitsluitend een niet-exclusief, niet-overdraagbaar gebruiksrecht voor de duur van het abonnement. Resultaten van berekeningen mag de Gebruiker gebruiken voor eigen professionele doeleinden.</P>

          <H2>Artikel 9 — Betaling en credits</H2>
          <P>Gebruik van betaalde functionaliteiten vereist een actief abonnement of voldoende credits. Credits zijn persoonsgebonden, niet overdraagbaar en niet restitueerbaar tenzij EarthGND de Dienst definitief beëindigt. Abonnementen worden maandelijks automatisch verlengd tenzij tijdig opgezegd via het dashboard.</P>

          <H2>Artikel 10 — Privacy</H2>
          <P>EarthGND verwerkt persoonsgegevens conform het Privacybeleid, beschikbaar op earthgnd.com/privacy. Door de Dienst te gebruiken stemt de Gebruiker in met die verwerking voor de beschreven doeleinden.</P>

          <H2>Artikel 11 — Toepasselijk recht en geschillen</H2>
          <P>Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden in eerste instantie voorgelegd aan de bevoegde rechter in het arrondissement waar EarthGND is gevestigd, tenzij partijen overeenkomen gebruik te maken van mediation.</P>

          <H2>Artikel 12 — Wijzigingen voorwaarden</H2>
          <P>EarthGND behoudt zich het recht voor deze voorwaarden te wijzigen. Gewijzigde voorwaarden worden minimaal 30 dagen voor inwerkingtreding per e-mail aangekondigd. Voortgezet gebruik na de ingangsdatum geldt als acceptatie.</P>

        </div>

        <div className="mt-10 rounded-xl border border-white/8 bg-white/3 px-5 py-4">
          <p className="text-xs text-white/40">
            <strong className="text-white/60">Vragen over deze voorwaarden?</strong>{' '}
            Neem contact op via{' '}
            <a href="mailto:info@earthgnd.com" className="text-[#E8761A] hover:underline">info@earthgnd.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
