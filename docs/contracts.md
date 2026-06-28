# EarthGND — Canonieke contracten (Fase 0, 2026-06)

Dit document legt de drie kerncontracten vast die verspreid gebruik in de codebase sturen.
Elke sectie eindigt met onbevestigde aannames die vervolgonderzoek vragen.

---

## A. RCD-grensformule

**Canonieke bron:** `calcOhmWizard()` in `lib/calculations.ts` (referentie-implementatie).

**Formule:** `Ra_max = UL / IΔn`
- `UL` = aanraakspanningsgrens (50 V droog, 25 V vochtig/buiten — NEN 1010)
- `IΔn` = nominale differentiaalstroom van de RCD in Ampere

**Correcte waarden bij UL = 50 V:**

| RCD  | Ra_max | Opmerking |
|------|--------|-----------|
| 30 mA  | 1667 Ω | persoonsbescherming (woningen) |
| 100 mA | 500 Ω  | brand / gemengde bescherming |
| 300 mA | 167 Ω  | brandbeveiliging, selectief |
| 500 mA | 100 Ω  | industrieel / selectief |

**Bij UL = 25 V:** alle waarden zijn de helft (833 / 250 / 83 / 50 Ω).

**Regel:** nooit hardcoded `166` als universele bovengrens. De 166 is alleen de afgeronde
waarde voor 300 mA bij 50 V — niet een zelfstandige NEN-norm.

**Onbevestigde aannames:**
- UL = 50 V voor alle droge binnenruimtes is een vereenvoudiging; NEN 1010:2020 kent
  ook aanraakspanningsklassen voor bijzondere ruimtes (bv. badkamers zone 1 = 25 V).
  EarthGND ondersteunt nu alleen 50 V / 25 V als toggle.

---

## B. `calculations`-tabelcontract

**Canonieke kolomnamen** (zoals de live code schrijft en leest):

| Kolom | Type | Inhoud |
|-------|------|--------|
| `id` | uuid | primaire sleutel |
| `user_id` | uuid | FK → profiles |
| `tool` | text | `'ohm'` of `'diepte'` |
| `postcode` | text | 4+2 postcode, nullable |
| `input_values` | jsonb | ruwe invoerparameters |
| `result` | jsonb | primaire uitvoer per tool (zie hieronder) |
| `risicoklasse` | text | nullable; alleen diepte-tool |
| `pdf_url` | text | nullable; signed URL na export |
| `created_at` | timestamptz | aanmaaktijdstip |

**Veld-structuur `input_values` (diepte-tool):**
```json
{
  "rho": 45,
  "targetResistance": 30,
  "groundwaterDepth": 1.5,
  "ph": 7.0,
  "electrodeType": "pen",
  "lithoClass": 3,
  "drijfmethode": null
}
```

**Veld-structuur `result` (diepte-tool):**
```json
{
  "dimension": 6.25,
  "achievedResistance": 28.94,
  "aantalPennen": 1
}
```

**Let op:** `result.dimension` = diepte (pen) of lengte (lint). Gebruik `getScanContext()`
(zie `lib/scan-context.ts`) om resultaten te lezen — die handelt ook legacy-data af.

**Legacy data:** de `schema.sql` had oorspronkelijk `input` en `resultaat` als kolomnamen.
Als de DB die kolommen nog heeft, zet dan de migratie `supabase/rename_calculations_columns.sql`
uit vóór gebruik van `getScanContext()`.

**Onbevestigde aannames:**
- De `calculations`-tabel bevat ook rijen van de ohm-tool (via `/api/pdf/route.ts`);
  `result.dimension` bestaat daar niet — `getScanContext()` geeft voor die rijen `undefined`
  terug voor `voorspeld_diepte_m`.
- `risicoklasse` wordt nog niet geschreven door `/api/diepte/calculate/route.ts` — de
  risicoklasse zit in `result.riskClass` (binnen de API-response) maar wordt niet gepersisteerd.
  Dit is een bekende gap; `getScanContext()` geeft `undefined` terug voor `risicoklasse`.

---

## C. ρ-waarheidshiërarchie

**Drie ρ-veen waarden** (geen bug — elk is de correcte waarde voor zijn context):

| Naam | Waarde | Bron | Wanneer |
|------|--------|------|---------|
| `LITHO_CLASS_TO_RHO_WET[5]` | 20 Ω·m  | kernel (bevroren) | NL CPT-statistiek, gelaagd model |
| kernel-WET (veen, nat) | 20 Ω·m | BRO CPT-statistiek | gelaagd model (soilSamples aanwezig) |
| `NL_RHO_WET_PRIOR[5]` | 10 Ω·m | NL veldkalibratie 2026-06 | actieve prior (SOIL_KNOWLEDGE_ACTIVE=true) |

**Geldende prioriteit** (fijnste niveau wint bij gelaagd model):

```
soilSamples (BRO CPT/boring aanwezig)
  → calcLayeredRhoEffective() gebruikt BRO-lithologie per laag
  → rhoWet per laag = LITHO_CLASS_TO_RHO_WET[klasse]   ← kernel-tabel (20 voor veen)

Geen soilSamples, wel gwDepth/rhoDry/rhoWet opgegeven
  → calcRhoEffective() gebruikt twee-laag harmonisch gemiddelde
  → rhoWet = resolveRhoWet(lithoClass, rhoFallback) via pipeline
     = NL_RHO_WET_PRIOR[klasse] indien bekend (10 voor veen)
     = LITHO_CLASS_TO_RHO_WET[klasse] als fallback (20 voor veen)
     = rhoFallback × 0.45 als geen klasse bekend

Geen gwDepth → enkelvoudig model
  → rho = rhoFallback (gebruikersinvoer, typisch de droge waarde)
```

**Veen-annotatie voor golden-set tests:**
- golden-set §6 (LITHO_CLASS_TO_RHO_WET[5]) pinned = **20** — bevroren kerneltabel, nooit aanpassen
- golden-set §7 (NL_RHO_WET_PRIOR[5]) pinned = **10** — NL-gekalibreerd, Fase 0 2026-06
- golden-set §8 (resolveRhoWet(5,...)) pinned = **10** — NL prior heeft prioriteit

**`dominantRho`-veld:**
`dominantRho` is een kernel-outputveld dat de meest dominante effectieve ρ toont (enkelvoudig of gewogen over het profiel). Het is een presentatieveld — niet de ρ die de berekening aanstuurt. De UI mag `dominantRho` tonen als indicatie, maar nooit als de gezaghebbende ρ gebruiken voor risicoklasse-bepaling.

**Onbevestigde aannames:**
- De grens tussen gelaagd model en twee-laag model hangt af van of `soilSamples` aanwezig is.
  Als BRO geen CPT/boring vindt, valt de pipeline terug op het twee-laag model — dit kan een
  stap in de gelaagde ρ veroorzaken als de gebruiker handmatig een hogere ρ invoert dan de prior.
- `SOIL_KNOWLEDGE_ACTIVE` is bewust uitgeschakeld totdat out-of-sample validatie is gedaan
  (zie Poort 3 in het gefaseerde plan).
