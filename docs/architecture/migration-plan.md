# Migratieplan — resterende 42 routes

Status na deze sessie: 3/45 routes gemigreerd (`bro`, `pdf`, `mail` —
bevindingen B1/B2/B3). De overige 42 staan op de krimpende allowlist
(`lib/authz/legacy-routes.ts`). Dit plan zet ze in een volgorde die
exploiteerbaarheid × impact weegt, net als de herstelvolgorde in het
oorspronkelijke auditrapport — niet gemaksvolgorde.

Elke fase is onafhankelijk mergebaar: de allowlist krimpt per gemigreerde
route, `check-route-manifest.ts` en `check-allowlist-shrinks.ts` bevestigen
dat automatisch. Geen fase hoeft op een andere te wachten.

## Fase 1 — Zelfde foutklasse als B2/B3, nog niet gedicht (hoogste prioriteit)

| Route | Waarom eerst | Aanpak |
|---|---|---|
| `app/api/email/rapport/route.ts` | Enige live (wél aangeroepen) route die nog `results`/`inputValues`/`diepteCalcResult` van de client vertrouwt — exact het patroon van B2, alleen stuurt hij tenminste al naar `user.email`. | Hergebruik `report:email` + `renderStoredCalculationPdf` (al gebouwd in `lib/domain/report-rendering.ts`); vereist alleen een `calculationId` i.p.v. het volledige resultaatobject. |
| `app/api/rapport/[id]/share/route.ts`, `app/api/rapport/[id]/pdf/route.ts`, `app/api/rapport/[id]/sign/route.ts` | Alle drie gebruiken het `x-internal === SUPABASE_SERVICE_ROLE_KEY`-patroon (bevinding B8) én roepen elkaar aan via eigen-`fetch()`-rondjes. | Vervang de drie interne HTTP-hops door directe functieaanroepen (ze draaien toch in hetzelfde proces); introduceer `INTERNAL_API_SECRET` alleen als een echte externe aanroeper overblijft. Nieuwe principal: `service`. |

## Fase 2 — Fail-open-patroon (bevinding B4/B11-klasse)

| Route | Wijziging |
|---|---|
| `app/api/admin/pipeline-status/route.ts`, `app/api/admin/soil-monitoring/route.ts` | Nieuwe capabilities `admin:pipeline-status`, `admin:soil-monitoring` met `allowedPrincipals: ['admin']` — `resolveAdminPrincipal()` (al gebouwd) is fail-closed: lege `ADMIN_EMAILS` = geen toegang, nooit "iedereen". |
| `app/api/support/cron/notify/route.ts` | Capability met `allowedPrincipals: ['cron']` — `resolveCronPrincipal()` (al gebouwd) gooit als `CRON_SECRET` ontbreekt, i.p.v. de check over te slaan. |
| `app/api/admin/import-meting/route.ts`, `app/api/admin/reprocess-metingen/route.ts` | Principal `service` met een dedicated secret i.p.v. `x-import-key` vergeleken met `!==` (niet-constant-time) — of laat staan als `service`-secret-vergelijking via `lib/authz/resolvers.ts`'s `safeEqual()`. |
| `app/api/debug-meting/route.ts` | **Niet migreren — verwijderen.** Dode debug-code met een hardcoded e-mailadres; hoort niet in productiecode (bevinding B10). |

## Fase 3 — Webhooks (al correct, migreren voor consistentie + de `webhook`-principal daadwerkelijk oefenen)

| Route | Notitie |
|---|---|
| `app/api/stripe/webhook/route.ts` | Signatuurverificatie is al correct (raw body, `constructEvent`) — dit is een hernoemingsslag naar `resolveStripeWebhookPrincipal`, geen gedragswijziging. Laagste risico van alle 42, goede eerste oefening voor het `webhook`-principal-pad. |
| `app/api/support/slack/events/route.ts`, `app/api/support/slack/interactions/route.ts` | Idem met `resolveSlackWebhookPrincipal` — al gebouwd, nog niet bedraad. |
| `app/api/stripe/checkout/route.ts` | Blijft `user`-principal; capability `checkout:create`. Prijs/bedrag blijven server-bepaald (was al correct) — puur een verhuizing. |

## Fase 4 — Ownership-zware CRUD (bewijst het `resourceOwner`-patroon op schaal)

`app/api/calculations/[uuid]/*`, `app/api/meting/[uuid]/*`,
`app/api/rapport/[id]/*` (resterend), `app/api/rapport/from-pendiepte/[uuid]`,
`app/api/colleagues/*`, `app/api/klic/route.ts`,
`app/api/opleverrapport/linkable/route.ts`, `app/api/profile/*`.

Deze routes zijn vandaag al redelijk zorgvuldig (consistent `.eq('user_id',
user.id)`, RLS als vangnet) — de migratie hier is vooral het verplaatsen van
bestaande, correcte checks naar `resourceOwner`-functies in
`lib/domain/**-repository.ts`, zodat toekomstige velden in deze tabellen
automatisch hetzelfde patroon volgen. Geen haastwerk; wel de grootste
oppervlakte, dus de beste plek om het patroon te stabiliseren vóór fase 5.

Let op `app/api/meting/[uuid]/route.ts`: de monteur-matching-logica
(`monteur_user_id === user.id || monteur_email === user.email`) is een
prima kandidaat voor een `resourceOwner`-functie die BEIDE condities checkt
— dat is precies het soort samengestelde ownership-regel die de huidige
`findCalculationOwnerId`-stijl (één simpele `user_id`-vergelijking) nog niet
dekt; dit wordt de eerste keer dat `resourceOwner` een OR-conditie nodig
heeft. Behandel dat als een uitbreiding van het contract
(`resourceOwner` mag intern meerdere kandidaat-ID's vergelijken), niet als
reden om er omheen te werken.

## Fase 5 — De credit-pipeline zelf (meeste zorg, minste haast)

`app/api/diepte/calculate/route.ts` is vandaag al correct (atomaire
credit-reservering, bewezen race-vrij) — de reden om hem als laatste te
migreren is niet risico, maar complexiteit: de pipeline heeft een
Class-A/B/D-foutmodel (zie `lib/pipeline/index.ts`) waarbij een credit soms
NIET gereserveerd mag worden (class A/B) en soms wél gereserveerd maar
gerefund moet worden (class D). Het huidige `defineEndpoint` reserveert
altijd vóór de handler en capture/release rond de hele aanroep — dat dekt
class D prima, maar class B ("bevestig eerst, dan pas reserveren") heeft een
kleine uitbreiding nodig: een `AbortWithoutCharge`-achtige throw die
`defineEndpoint` als "geen reservering, wel een specifieke respons"
behandelt (zie de `UseCaseRejection`-klasse in `lib/edge/responses.ts` als
startpunt — dat dekt het "reserveer niet, geef 422 terug"-geval al als de
reservering nog niet gedaan is; test dit zorgvuldig tegen
`scripts/golden-set-verify.ts` vóórdat je hem inzet, want dat is de test die
vandaag garandeert dat de pipeline-uitkomst ongewijzigd blijft).

## Fase 6 — Publieke, gratis proxy's (rate-limit-hygiëne, bevinding B6)

`app/api/pdok/route.ts`, `app/api/groundwater/route.ts`, `app/api/crm/route.ts`.

Deze blijven `anonymous`-toegankelijk (geen productwijziging), maar krijgen
een `rateLimit`-regel in de registry — vandaag hebben ze er geen, wat
bevinding B6 was. `app/api/crm/route.ts` verdient bovendien basale
invoervalidatie (e-mailformaat, whitelist van `tool`-waarden) als onderdeel
van dezelfde migratie, niet als apart ticket.

## Volgordelogica, samengevat

Fase 1–2 sluiten resterende, nog-open bevindingsklassen (B2/B3/B8/B4/B11-stijl).
Fase 3 is risicoloos en oefent het `webhook`-pad. Fase 4 stabiliseert het
ownership-patroon op de grootste groep. Fase 5 raakt de gevoeligste
bedrijfslogica het laatst, met opzet. Fase 6 is hygiëne, geen kwetsbaarheid.
