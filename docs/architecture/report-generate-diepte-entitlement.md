# Entitlement voor `report:generate-diepte`

**Status:** business-rule-beslissing genomen tijdens de migratie van
`/api/pdf` (bevinding B2). Niet eerder vastgelegd — deze route had vóór de
migratie helemaal geen toegangscontrole, dus er is geen "oud gedrag" om
hier te bewaren, alleen een keuze die te maken viel.

## De vraag

`/api/pdf` had geen live aanroeper in de frontend (geverifieerd: geen
`fetch('/api/pdf')`/`fetch('/api/mail')` in `components/**`). Bij het
opnieuw bedraden moest ik dus kiezen: vereist het opnieuw genereren van een
PDF voor een reeds uitgevoerde Diepte-berekening een *actueel* betaald plan
(`hasActivePlanAccess`), of alleen eigenaarschap van de rij?

## De beslissing

Alleen eigenaarschap (`requiresOwnership: true`, `entitlement: { type:
'none' }`). Geen aparte plan-check.

## Waarom

De credit voor deze berekening is al afgeschreven op het moment dat hij is
uitgevoerd (`diepte:calculate`, atomair, ongewijzigd). Het artefact
(PDF) opnieuw opvragen is geen nieuwe berekening — het is het opnieuw
serialiseren van data die de gebruiker al betaald en ontvangen heeft. Een
plan-vervalmoment mag met terugwerkende kracht geen toegang tot eerder
gekochte, reeds afgeleverde resultaten intrekken; dat zou een
gebruiker die zijn abonnement opzegt met terugwerkende kracht zijn eigen
rapporten laten kwijtraken.

## Als dit ooit verandert

Wijzig `CAPABILITY_REGISTRY['report:generate-diepte'].entitlement` naar
`{ type: 'requires-active-plan' }` in `lib/authz/capability.ts` en werk dit
document bij met de nieuwe motivatie.
