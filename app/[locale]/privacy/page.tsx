export const metadata = {
  title: 'Privacybeleid — EarthGND',
  description: 'Privacybeleid en AVG-informatie voor EarthGND',
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

interface ThirdParty {
  name: string;
  role: string;
  country: string;
  privacy: string;
}

const THIRD_PARTIES: ThirdParty[] = [
  { name: 'Supabase Inc.',         role: 'Authenticatie, database en bestandsopslag',           country: 'VS (SCCs)',     privacy: 'supabase.com/privacy' },
  { name: 'Resend Inc.',           role: 'Transactionele e-mail (uitnodigingen, bevestigingen)', country: 'VS (SCCs)',     privacy: 'resend.com/privacy' },
  { name: 'Stripe Inc.',           role: 'Betalingsverwerking en abonnementsbeheer',             country: 'VS (SCCs)',     privacy: 'stripe.com/privacy' },
  { name: 'Vercel Inc.',           role: 'Hosting en serverless-infrastructuur',                 country: 'VS (SCCs)',     privacy: 'vercel.com/legal/privacy-policy' },
  { name: 'PDOK / Kadaster',       role: 'Reverse geocodering van coördinaten naar postcode',    country: 'Nederland',     privacy: 'pdok.nl' },
  { name: 'BRO (Ministerie BZK)',  role: 'Publieke bodemdata (CPT, boringen, peilbuizen)',       country: 'Nederland',     privacy: 'basisregistratieondergrond.nl' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-12">

        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E8761A]">EarthGND</p>
          <h1 className="mt-2 text-3xl font-black text-[#F5EFE6]">Privacybeleid</h1>
          <p className="mt-2 text-xs text-white/40">Versie 1.0 · Ingangsdatum: 1 januari 2025 · AVG-conform</p>
        </div>

        <div className="prose-none">

          <H2>1. Verwerkingsverantwoordelijke</H2>
          <P>
            [BEDRIJFSNAAM], gevestigd te [ADRES], KvK [KVK], is verwerkingsverantwoordelijke in de zin van de Algemene
            Verordening Gegevensbescherming (AVG / GDPR) voor de verwerking van persoonsgegevens via EarthGND.
            Contactpersoon privacy: <a href="mailto:privacy@earthgnd.com" className="text-[#E8761A] hover:underline">privacy@earthgnd.com</a>.
          </P>

          <H2>2. Welke gegevens verwerken wij</H2>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li><strong className="text-white/90">Accountgegevens:</strong> e-mailadres, aanmaakmomant, abonnementstype en creditstand.</Li>
            <Li><strong className="text-white/90">Berekeningsinvoer:</strong> ingevoerde bodemparameters (ρ, pH, grondwaterstand), postcode en geselecteerde elektrode-instellingen. Géén NAW-gegevens van eindgebruikers/woningeigenaars.</Li>
            <Li><strong className="text-white/90">Berekeningsresultaten:</strong> berekende pendiepte, risicoklasse, corrosieklasse en vertrouwensscores. Worden opgeslagen om de jobhistorie en het opleverrapport mogelijk te maken.</Li>
            <Li><strong className="text-white/90">Veldmeetgegevens (monteurflow):</strong> GPS-coördinaten van de meetlocatie, dieptecurve (per-3m Ra-waarden), geïnstalleerde diepte en eindmeting. Worden uitsluitend ingevoerd door de monteur zelf.</Li>
            <Li><strong className="text-white/90">Communicatiegegevens:</strong> e-mailadres van de uitgenodigde monteur, tijdstip van uitnodiging.</Li>
            <Li><strong className="text-white/90">Technische gegevens:</strong> server-side logs (IP-adres, tijdstip, HTTP-statuscode) voor foutopsporing. Worden maximaal 30 dagen bewaard.</Li>
            <Li><strong className="text-white/90">Betalingsgegevens:</strong> betalingsverwerking geschiedt volledig via Stripe. EarthGND slaat geen betaalkaartgegevens op.</Li>
          </ul>

          <H2>3. Doeleinden en rechtsgrondslagen</H2>
          <div className="mb-3 overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="px-4 py-2.5 text-left font-semibold text-white/60">Doel</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-white/60">Grondslag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  ['Leveren van de berekeningsdienst', 'Uitvoering overeenkomst (Art. 6 lid 1 sub b)'],
                  ['Opslaan van jobhistorie en opleverrapporten', 'Uitvoering overeenkomst'],
                  ['Versturen van transactionele e-mails (uitnodigingen, bevestigingen)', 'Uitvoering overeenkomst'],
                  ['Creditbeheer en facturering via Stripe', 'Uitvoering overeenkomst'],
                  ['Technische foutopsporing (server logs)', 'Gerechtvaardigd belang (Art. 6 lid 1 sub f)'],
                  ['Verbetering van het bodemmodel met geanonimiseerde velddata', 'Gerechtvaardigd belang — opt-out mogelijk'],
                ].map(([doel, grondslag]) => (
                  <tr key={doel}>
                    <td className="px-4 py-2.5 text-white/70">{doel}</td>
                    <td className="px-4 py-2.5 text-white/50">{grondslag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            EarthGND gebruikt veldmeetgegevens (GPS-locaties, dieptecurves) uitsluitend voor het genereren van uw eigen
            opleverrapport. Geaggregeerde en geanonimiseerde data kan worden gebruikt om bodemmodellen te verbeteren;
            dit levert altijd te herleiden tot louter statistische patronen, niet tot individuele locaties of personen.
            U kunt hiervoor opt-out aanvragen via <a href="mailto:privacy@earthgnd.com" className="text-[#E8761A] hover:underline">privacy@earthgnd.com</a>.
          </P>

          <H2>4. Bewaartermijnen</H2>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li><strong className="text-white/90">Accountgegevens:</strong> zolang het account actief is, plus 12 maanden na beëindiging (fiscale bewaarplicht).</Li>
            <Li><strong className="text-white/90">Berekenings- en meetgegevens:</strong> zolang het account actief is. Na verwijdering van het account worden gegevens binnen 30 dagen gewist.</Li>
            <Li><strong className="text-white/90">Bevestigde opleverrapporten:</strong> 7 jaar conform fiscale bewaarplicht, tenzij u eerder om verwijdering verzoekt (dan worden persoonsgegevens gepseudonimiseerd).</Li>
            <Li><strong className="text-white/90">Server logs:</strong> maximaal 30 dagen.</Li>
          </ul>

          <H2>5. Ontvangers en sub-verwerkers</H2>
          <P>EarthGND maakt gebruik van de volgende sub-verwerkers. Met alle sub-verwerkers buiten de EER zijn Standard Contractual Clauses (SCCs) afgesloten conform Art. 46 AVG.</P>
          <div className="mb-3 overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="px-4 py-2.5 text-left font-semibold text-white/60">Partij</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-white/60">Rol</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-white/60">Locatie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {THIRD_PARTIES.map(p => (
                  <tr key={p.name}>
                    <td className="px-4 py-2.5 text-white/70">
                      <a href={`https://${p.privacy}`} target="_blank" rel="noreferrer"
                         className="text-[#E8761A] hover:underline">{p.name}</a>
                    </td>
                    <td className="px-4 py-2.5 text-white/60">{p.role}</td>
                    <td className="px-4 py-2.5 text-white/40">{p.country}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            PDOK en BRO zijn publieke Nederlandse overheidsregisters. Wanneer u een postcode of locatie invoert,
            wordt een anoniem verzoek verstuurd naar deze diensten. Hierbij wordt géén e-mailadres of accountinformatie
            gedeeld.
          </P>

          <H2>6. Uw rechten als betrokkene</H2>
          <P>Onder de AVG heeft u de volgende rechten, die u kunt uitoefenen via <a href="mailto:privacy@earthgnd.com" className="text-[#E8761A] hover:underline">privacy@earthgnd.com</a>:</P>
          <ul className="mb-3 ml-4 list-disc space-y-1">
            <Li><strong className="text-white/90">Inzage (Art. 15):</strong> u kunt opvragen welke gegevens wij over u verwerken.</Li>
            <Li><strong className="text-white/90">Rectificatie (Art. 16):</strong> u kunt onjuiste gegevens laten corrigeren.</Li>
            <Li><strong className="text-white/90">Verwijdering (Art. 17):</strong> u kunt verwijdering verzoeken; wij verwijderen persoonsgegevens tenzij wettelijke bewaarplicht van toepassing is.</Li>
            <Li><strong className="text-white/90">Beperking (Art. 18):</strong> u kunt verzoeken de verwerking tijdelijk te beperken.</Li>
            <Li><strong className="text-white/90">Overdraagbaarheid (Art. 20):</strong> u kunt uw berekeningsgeschiedenis opvragen in machineleesbaar formaat (JSON).</Li>
            <Li><strong className="text-white/90">Bezwaar (Art. 21):</strong> u kunt bezwaar maken tegen verwerking op grond van gerechtvaardigd belang.</Li>
          </ul>
          <P>Wij reageren binnen 30 dagen op verzoeken. Als wij een verzoek niet of niet volledig kunnen inwilligen, motiveren wij dit schriftelijk.</P>

          <H2>7. Beveiliging</H2>
          <P>
            EarthGND neemt passende technische en organisatorische maatregelen ter beveiliging van persoonsgegevens:
            versleutelde verbindingen (TLS), authenticatie via Supabase met one-time passwords, rij-niveau beveiliging (RLS)
            in de database zodat gebruikers uitsluitend eigen data kunnen inzien, en rolgebaseerde toegangscontrole voor
            monteurs (uitsluitend toegang tot de aan hen gekoppelde job).
          </P>

          <H2>8. Cookies en tracking</H2>
          <P>
            EarthGND gebruikt uitsluitend functionele sessiecookies die noodzakelijk zijn voor authenticatie.
            Er worden geen tracking-cookies, advertentiecookies of derde-partij analysescripts geplaatst.
            Toestemming voor cookies is daarom niet vereist op grond van Art. 11.7a Telecommunicatiewet.
          </P>

          <H2>9. Klachten</H2>
          <P>
            Bent u niet tevreden met de wijze waarop EarthGND met uw persoonsgegevens omgaat? Neem eerst contact op
            via <a href="mailto:privacy@earthgnd.com" className="text-[#E8761A] hover:underline">privacy@earthgnd.com</a>.
            U heeft tevens het recht een klacht in te dienen bij de{' '}
            <a href="https://www.autoriteitpersoonsgegevens.nl" target="_blank" rel="noreferrer"
               className="text-[#E8761A] hover:underline">Autoriteit Persoonsgegevens</a>.
          </P>

          <H2>10. Wijzigingen</H2>
          <P>
            Dit privacybeleid kan worden gewijzigd. Materiële wijzigingen worden minimaal 30 dagen van tevoren per
            e-mail aangekondigd. De meest actuele versie staat altijd op earthgnd.com/privacy.
          </P>

        </div>

        <div className="mt-10 rounded-xl border border-white/8 bg-white/3 px-5 py-4">
          <p className="text-xs text-white/40">
            <strong className="text-white/60">Privacyvragen of verzoeken?</strong>{' '}
            <a href="mailto:privacy@earthgnd.com" className="text-[#E8761A] hover:underline">privacy@earthgnd.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
