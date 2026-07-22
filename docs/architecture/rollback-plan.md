# Rollbackplan

Drie niveaus, van klein naar groot. Begin altijd bij het kleinste niveau dat
het probleem oplost.

## Niveau 1 — Eén gemigreerde route teruggezet

Elke gemigreerde route is een self-contained herschrijving van één bestand
plus zijn use-case-module. Terugzetten breekt niets anders:

```bash
# /api/bro teruggeven aan het oude, ongeauthenticeerde gedrag
git checkout main -- app/api/bro/route.ts

# /api/pdf
git checkout main -- app/api/pdf/route.ts

# /api/mail
git checkout main -- app/api/mail/route.ts
```

Voeg de teruggezette route(s) daarna weer toe aan
`lib/authz/legacy-routes.ts` — anders faalt `check-route-manifest.ts` (hij
gebruikt geen `defineEndpoint` meer, en staat niet op de allowlist). Dit is
een bewuste wrijving: teruggaan naar onveilig gedrag moet zichtbaar en
opzettelijk zijn, niet een stille bijeffect van `git checkout`.

De ongebruikte `lib/application/bro-lookup.ts` /
`lib/application/report-generate.ts` / `lib/application/report-email.ts`
mogen blijven staan — niets anders importeert ze, ze zijn geen actief risico.

## Niveau 2 — De kernel tijdelijk niet afdwingen (CI-gate ontgrendelen)

Als een van de vier CI-poorten een merge blokkeert die om een andere,
dringende reden toch door moet (bv. een productie-hotfix onder tijdsdruk):

```yaml
# .github/workflows/ci.yml — TIJDELIJK, met een issue-link erbij
- name: Secure-endpoint-architectuur
  run: npm run verify:architecture || echo "::warning::verify:architecture overgeslagen — zie issue #NNN"
```

Gebruik dit uitsluitend met een direct daaropvolgende PR die het weer
hard-fail maakt. Dit is bewust omslachtig (een zichtbare `::warning::`-regel
in elke CI-run) zodat het niet per ongeluk permanent blijft staan.

**Doe dit nooit voor de allowlist-krimp-check specifiek** — als die in de
weg zit, is het antwoord bijna altijd "verwijder de nieuwe route weer" of
"migreer hem alsnog", niet "verzwak de poort".

## Niveau 3 — De hele kernel terugdraaien

De kernel (`lib/authz/**`, `lib/edge/**`, `lib/domain/**`,
`lib/application/**`) wordt door niets buiten de drie gemigreerde routes
geïmporteerd. Volledig terugdraaien:

```bash
git checkout main -- app/api/bro/route.ts app/api/pdf/route.ts app/api/mail/route.ts
git rm -r lib/authz lib/edge lib/domain lib/application
git checkout main -- app/[locale]/tool/diepte/page.tsx   # gebruikte hasActivePlanAccess
git rm -r scripts/architecture scripts/verify-architecture.ts
git checkout main -- .github/workflows/ci.yml package.json
```

Dit herstelt het exacte pre-migratie-gedrag inclusief de drie kritieke
bevindingen (B1/B2/B3) — gebruik dit alleen als de nieuwe architectuur zelf
een productie-incident veroorzaakt (bv. een onverwacht strengere
autorisatie die legitieme gebruikers blokkeert) én niveau 1/2 het niet snel
genoeg oplossen. Volg dit meteen op met een terugkoppeling naar het
audit-/architectuurtraject — dit niveau mag geen stille, permanente keuze
worden.

## Wat rollback NIET beïnvloedt

RLS-policies (`supabase/*.sql`) zijn onafhankelijk van deze migratie en
blijven ongewijzigd bij elk van de drie niveaus — dat was het hele punt van
vereiste #9. Een rollback van de applicatielaag verzwakt dus nooit de
database-laag zelf.
