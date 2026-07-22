# EarthGND Homepage Audit Report

_Generated: 2026-07-22_

---

## 1. Current Homepage Content (verbatim)

**Route:** `/app/[locale]/page.tsx`

### Hero

| Element | Content |
|---------|---------|
| Norm badge | `NEN 1010 · NEN 62305 · NEN 50522` |
| H1 line 1 | `Aardingsweerstand.` |
| H1 line 2 (orange) | `Direct bepaald.` |
| Subtitle | `Twee professionele calculators voor elektrotechnici en aannemers. Van maximale weerstand tot exacte pendiepte — onderbouwd met BRO bodemdata.` |
| CTA primary | `Weerstand berekenen — gratis` → `/tool/ohm` |
| CTA secondary | `Bekijk tarieven` → `/pricing` |

### Twee kaarten

**Kaart 1 — Gratis**
- Label: `Altijd gratis`
- H2: `Weerstand Calculator`
- Beschrijving: kies stelsel, installatietype, aardlekschakelaar → vier outputlagen
- Features: Weerstand Calculator onbeperkt / TT- en TN-stelsel / NEN 1010 normen / Geen account nodig
- CTA: `Open calculator` → `/tool/ohm`

**Kaart 2 — Betaald**
- Label: `Vanaf €39/mnd`
- Notitie: `of €5,95 per berekening`
- H2: `Pendiepte Calculator`
- Beschrijving: postcode invoeren, BRO data auto, berekent pendiepte
- Features: BRO bodemdata per postcode / Risicoklasse I–IV / Drie berekende scenario's / PDF rapport / Grondwater & pH correcties
- CTA: `Bekijk tarieven` → `/pricing`

### Drie pillars

| Pillar | Titel | Beschrijving |
|--------|-------|--------------|
| 1 | `BRO Bodemdata` | Grondsoort, GWT en pH uit Basis Registratie Ondergrond op postcode |
| 2 | `NEN 1010 normen` | Alle berekeningen conform NEN 1010, NEN 62305 en NEN 50522 |
| 3 | `Indicatief rapport` | Exporteer een onderbouwde PDF met invoerwaarden, formule en risicoklasse |

Geen footer CTA. Pagina eindigt na de pillars.

---

## 2. Alle Routes / Pages

### Frontend pages

| Route | Bestand | Omschrijving |
|-------|---------|--------------|
| `/` | `app/[locale]/page.tsx` | Homepage |
| `/tool/ohm` | `app/[locale]/tool/ohm/page.tsx` | Weerstand Calculator (gratis) |
| `/tool/diepte` | `app/[locale]/tool/diepte/page.tsx` | Pendiepte Calculator (betaald) |
| `/pricing` | `app/[locale]/pricing/page.tsx` | Tarieven (4 plans + losse credits slider) |
| `/dashboard` | `app/[locale]/dashboard/page.tsx` | Gebruikersdashboard met credits, berekeningen, veldmetingen, rapporten |
| `/dashboard/archief` | `app/[locale]/dashboard/archief/page.tsx` | Archief pagina |
| `/meting/[uuid]` | `app/[locale]/meting/[uuid]/page.tsx` | Monteur veldmeting formulier |
| `/rapport/nieuw` | `app/[locale]/rapport/nieuw/page.tsx` | Maak nieuw NEN 1010 inspectie-rapport |
| `/rapport/[id]` | `app/[locale]/rapport/[id]/page.tsx` | NEN 1010 deel 6 inspectie-rapport editor |
| `/opleverrapport` | `app/[locale]/opleverrapport/page.tsx` | Koppelen veldmeting aan opleverrapport |
| `/pendiepte-rapport/[uuid]` | `app/[locale]/pendiepte-rapport/[uuid]/page.tsx` | Pendiepte opleverrapport view |
| `/login` | `app/[locale]/login/page.tsx` | Login |
| `/instellingen` | `app/[locale]/instellingen/page.tsx` | Gebruikersinstellingen |
| `/faq` | `app/[locale]/faq/page.tsx` | FAQ |
| `/certificaat` | `app/[locale]/certificaat/page.tsx` | Redirect naar dashboard |
| `/privacy` | `app/[locale]/privacy/page.tsx` | Privacybeleid |
| `/voorwaarden` | `app/[locale]/voorwaarden/page.tsx` | Algemene voorwaarden |
| `/admin/pipeline` | `app/[locale]/admin/pipeline/page.tsx` | Admin: pipeline status |
| `/admin/soil-monitoring` | `app/[locale]/admin/soil-monitoring/page.tsx` | Admin: grondkennis monitoring |

### API routes (selectie relevant voor homepage)

| Route | Functie |
|-------|---------|
| `/api/diepte/calculate` | Pendiepte berekening engine |
| `/api/bro` | BRO bodemdata ophalen |
| `/api/pdf` | PDF generatie (Ohm + Diepte) |
| `/api/rapport/[id]/pdf` | NEN 1010 rapport PDF |
| `/api/rapport/[id]/sign` | Ondertekenen rapport |
| `/api/meting/[uuid]` | Veldmeting CRUD |
| `/api/calculations/[uuid]/notify` | Monteur uitnodigen per e-mail |
| `/api/stripe/checkout` | Stripe checkout sessie |
| `/api/support/*` | Support widget (Slack) |

---

## 3. Feature Inventory

| Feature | Bestaat in App | Vermeld op Homepage | Gap |
|---------|---------------|--------------------|----|
| Weerstand Calculator (gratis) | ✅ | ✅ | — |
| Pendiepte Calculator | ✅ | ✅ | — |
| BRO bodemdata auto-fetch | ✅ | ✅ | — |
| Risicoklasse I–IV | ✅ | ✅ | — |
| PDF rapport (berekening) | ✅ | ✅ (als "Indicatief rapport") | Onderschat — het is een volledig ondertekend rapport |
| Monteur uitnodigen per e-mail | ✅ | ❌ | **Gap** |
| Digitale veldmeting (monteur app) | ✅ `/meting/[uuid]` | ❌ | **Gap** |
| NEN 1010 deel 6 opleverrapport | ✅ | ❌ | **Gap** |
| Rapport ondertekenen & archiveren | ✅ | ❌ | **Gap** |
| Dashboard (credits, geschiedenis) | ✅ | ❌ | **Gap** |
| Collega's / team feature | ✅ (`/api/colleagues`) | ❌ | **Gap** |
| KLIC melding beheer | ✅ (`KlicForm`, `KlicWidget`) | ❌ | **Gap** |
| Empirisch grondmodel (Poort D) | ✅ (staging, 10% blend) | ❌ | Staging feature, nog niet klaar voor marketing |
| Meerdere berekeningsscenario's | ✅ (gunstig/gemiddeld/ongunstig) | ✅ | — |
| E-mail rapport delivery | ✅ | ❌ | **Gap** |
| Credit systeem (monthly + losse) | ✅ | Deels (€5,95/berekening vermeld) | Slider & bundelkorting niet zichtbaar |
| Pricing transparant | ✅ (pricing page) | Deels | Prijzen niet op homepage |
| Support widget (Slack) | ✅ (nieuw) | ❌ | Niet nodig op homepage |
| Multi-language (NL/EN/DE) | ✅ | ❌ | Laag prioriteit |
| AVG-compliant / EU-opslag | ✅ (pricing page vermeld) | ❌ | **Gap** (vertrouwen) |

---

## 4. Geïdentificeerde Gaps

### Missing Features (bestaan in app, niet op homepage)

**1. Monteur veldmeting workflow** — KRITISCH
De complete flow Bereken → Nodig uit → Meet → Rapporteer is de kernwaarde van het product. Nergens op de homepage zichtbaar. Bezoekers zien alleen twee losse calculators, niet het geïntegreerde systeem.

**2. NEN 1010 deel 6 Opleverrapport** — KRITISCH
De pillar "Indicatief rapport" omschrijft een eenvoudige PDF-export, maar het werkelijke product is een volledig NEN 1010 deel 6 opleverrapport met digitale handtekening, audit trail en dossierarchief. Dit is een fundamenteel verkoopargument dat volledig ontbreekt.

**3. Team/collega's workflow** — MEDIUM
Multi-user functionaliteit (collega's uitnodigen, monteur e-mail workflow) bestaat maar is onzichtbaar.

**4. Dashboard / Dossier** — MEDIUM
Na aankoop heeft de gebruiker een volledig dashboard met berekeningsgeschiedenis, veldmetingen en rapporten. Dit geeft een beeld van het systeem als langdurige tool, niet als eenmalige rekenmachine.

**5. Vertrouwenssignalen ontbreken** — MEDIUM
AVG-compliant, EU-opslag, automatische factuur staan alleen op de pricing pagina. Homepage geeft geen vertrouwensbasis.

**6. KLIC integratie** — LAAG
Bestaat maar is niche — weglaten van homepage is acceptabel.

### Content Gaps

- **Werkwoordformule:** Homepage zegt "calculators" maar het product is een systeem. Kopijtekst mist het verhaal.
- **Doelgroepen:** Geen onderscheid tussen elektrotechnicus/installateur/aannemer/monteur. Iedereen leest dezelfde homepage.
- **Sociale bewijskracht:** Geen klantcijfers, geen testimonials, geen sector-referenties.
- **Empirisch model:** Als USP te vroeg voor homepage (nog staging), maar de nauwkeurigheid van BRO-data kan sterker worden uitgelicht.

### Design/UX Gaps

- Geen workflow-visualisatie (stappen 1-2-3-4)
- Geen voorbeeldresultaat zichtbaar zonder inloggen
- Pillar 3 is misleidend ("Indicatief" vs. werkelijkheid)
- Secundaire CTA "Bekijk tarieven" verliest momentum — bezoeker wil de tool proberen, niet een tariefpagina zien

---

## 5. Aanbevelingen

### Hoge prioriteit

1. **Workflow-sectie toevoegen** — Vier stappen: Bereken → Nodig uit → Meet → Rapporteer. Dit is de kernwaarde van het product.
2. **Pillar 3 herschrijven** — Van "Indicatief rapport" naar "Getekend opleverrapport" met correcte omschrijving.
3. **Paid card features uitbreiden** — Toevoegen: "Monteur uitnodigen per e-mail" en "NEN 1010 deel 6 opleverrapport".
4. **Titelregel aanpassen** — "Direct bepaald" is te beperkt. "Berekend. Gerapporteerd." dekt de volledige workflow.
5. **Showcase pagina aanmaken** — `/examples/pendiepte`: toon een realistisch voorbeeld zonder inloggen.

### Medium prioriteit

6. **Vertrouwenssignalen naar homepage** — AVG, EU-opslag, automatische factuur als kleine strip onderaan.
7. **Secundaire CTA versterken** — "Pendiepte berekenen" i.p.v. "Bekijk tarieven" zodat de bezoeker direct de tool ingaat.
8. **Bottom CTA strip** — Duidelijk eindpunt met twee paden: gratis starten vs. direct kopen.

### Lage prioriteit

9. KLIC integratie vermelden (niche, kan later)
10. Empirisch model highlighten (wacht op productie-release)

---

## 6. Voorgestelde Homepage Structuur

```
Hero
├── Badge: NEN 1010 · NEN 62305 · NEN 50522
├── H1: "Aardingsweerstand. / Berekend. Gerapporteerd."
├── Subtitle: volledige workflow in één zin
├── CTA 1: "Weerstand berekenen — gratis" → /tool/ohm
└── CTA 2: "Pendiepte berekenen" → /tool/diepte

Workflow Strip (NIEUW)
├── Stap 1: Bereken — BRO bodemdata, pendiepteberekening
├── Stap 2: Nodig uit — monteur e-mail taakopdracht
├── Stap 3: Meet — digitale veldmeting bevestiging
└── Stap 4: Rapporteer — NEN 1010 deel 6 opleverrapport

Calculator Kaarten (bestaand, uitgebreid)
├── Gratis: Weerstand Calculator (ongewijzigd)
└── Betaald: Pendiepte Calculator
    ├── + Monteur uitnodigen per e-mail
    └── + NEN 1010 deel 6 opleverrapport

Pillars (bestaand, pillar 3 herschreven)
├── BRO Bodemdata (ongewijzigd)
├── NEN 1010 normen (ongewijzigd)
└── Getekend opleverrapport (was: Indicatief rapport) ← FIX

Bottom CTA Strip (NIEUW)
├── "Begin gratis" → /tool/ohm
├── "Pendiepte berekenen" → /pricing
└── "Zie een voorbeeldberekening →" → /examples/pendiepte
```
