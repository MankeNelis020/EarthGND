# Facturatiegrens: BRO-lookup vs. Diepte-berekening

**Status:** business-rule-beslissing genomen tijdens de migratie van `/api/bro`
(bevinding B1). Niet eerder expliciet vastgelegd in de repository — dit
document is de vastlegging.

## Wat wél al vaststond

- `lib/plans.ts`: gratis plan heeft `credits: 0`.
- `lib/pipeline/credit.ts` → `lib/credits.ts` → `supabase/credits_functions.sql`:
  `diepte:calculate` schrijft atomair **1 credit** af per aanroep, ongeacht of
  een postcode is meegegeven.
- `app/[locale]/tool/diepte/page.tsx:85`: de Diepte-pagina zelf is alleen
  bereikbaar met `plan !== 'gratis' || credits_left > 0` — dit schrijft niets
  af, het is een toegangsdrempel.
- Nergens in de repository staat een prijs, credit-kosten of aparte
  tier-eis voor een BRO-lookup op zichzelf.

## De beslissing

`bro:lookup` gebruikt de eerste regel (`requires-active-plan`), niet de
tweede (`consumes-credit`). Een BRO-lookup schrijft dus **nooit** een credit
af — alleen `diepte:calculate` doet dat, exact zoals vandaag.

## Waarom

In de UI (`components/tools/PostcodeInput.tsx` binnen `DiepteCalculator.tsx`)
zijn "adres opzoeken" en "berekening starten" twee stappen van dezelfde
gebruikersactie. Ze apart belasten zou een **nieuwe, nergens gedocumenteerde
prijsverhoging** zijn (een gebruiker die drie postcodes probeert vóór hij
de juiste intypt, zou nu drie keer betalen voor één berekening). Dat is een
productbeslissing die niet stilzwijgend in een beveiligingsmigratie hoort
te worden genomen.

De vorige situatie (compleet ongeauthenticeerd, B1) was het andere uiterste.
De correctie is de kleinst mogelijke stap die de kwetsbaarheid sluit zonder
het prijsmodel te wijzigen: verplicht dezelfde toegangsdrempel die al voor
de pagina gold, voor de API zelf.

## Test die dit vastlegt

`scripts/architecture/test-authz-kernel.ts` bevat een scenario dat twee
`bro:lookup`-aanroepen laat volgen door één `diepte:calculate`-aanroep (met
een in-memory credit-mock) en controleert dat de credit-teller precies één
keer daalt — niet drie keer.

## Als dit ooit verandert

Wijzig dan `CAPABILITY_REGISTRY['bro:lookup'].entitlement` naar
`{ type: 'consumes-credit', cost: N }` in `lib/authz/capability.ts`, en werk
dit document bij met de nieuwe motivatie. Dat is de enige plek die moet
veranderen — geen route-code.
