# EarthGND

Nederlandse SaaS voor aarding (TT-stelsel): weerstandscalculator, pendiepteberekening met BRO-bodemdata, opleverrapporten en veldmeting-validatie.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Supabase** (auth, Postgres, RLS)
- **Stripe**, **Resend**, **Upstash Redis**
- **next-intl** (nl / en / de)

## Snel starten

```bash
cp .env.example .env.local
# Vul Supabase, Stripe, Resend en overige keys in

npm install
npm run dev
```

Open [http://localhost:3000/nl](http://localhost:3000/nl).

## Scripts

| Commando | Doel |
|----------|------|
| `npm run dev` | Development server |
| `npm run build` | Productie-build (lint + typecheck) |
| `npm test` | Regressie: golden-set + pendiepte-model-check |
| `npm run golden-set` | 92 pinned asserts op kernel + priors |
| `npm run test:pendiepte` | Adapter/policy regressies (ρ, parallel, Orkaden) |
| `npm run gate:depth` | Veld-diepte gate (+30% conservatisme, vereist `.calibration-cache`) |
| `npm run calibrate:fase0` | Counterfactual ρ-rapport (offline BRO-cache) |
| `npm run i18n:check` | Ontbrekende vertaalsleutels |

## Architectuur (kern)

```
lib/calculations.ts          ← bevroren kernel (Dwight, RCD, risicoklasse)
lib/pipeline/                ← adapter, ρ-priors, parallel-policy, driveability
lib/soil-knowledge/          ← L1–L4 priors (SOIL_KNOWLEDGE_ACTIVE=false in prod)
docs/contracts.md            ← canonieke contracten §A–§D
docs/phased-gates.md         ← Poort 1–4 acceptatiecriteria
```

**ρ-waarheid:** zie `docs/contracts.md` §C — GENERAL (2000 veen) ≠ kernel-WET (20) ≠ NL prior (10).

**Parallel-beleid:** zie §D — geen auto-advies op diepte alleen; alleen indrijfbaarheid of expliciete UI-keuze.

## Supabase

Migratievolgorde: `docs/supabase-migrations.md`.

Canonieke kolommen `calculations`: `input_values`, `result`, `risicoklasse`.

## Poorten (gefaseerd)

| Poort | Status | Beschrijving |
|-------|--------|--------------|
| 1 | ✅ | Trust foundation (RCD, schema, scan-context) |
| P1 | ✅ | NL layered adapter, effectieve ρ |
| 2 | 🔄 | Shadow mode + veldmetingen (`shadow_predictions.actual_rho`) |
| 3 | ⏸ | `SOIL_KNOWLEDGE_ACTIVE` — pas na OOS-validatie |
| 4 | ⏸ | Empirisch gewicht in productie |

Details: `docs/phased-gates.md`.

## Stub-routes

- `/certificaat` — redirect-stub; certificaten via dashboard/archief.

## CI

GitHub Actions draait `npm test`, `npm run lint` en `npm run build` op push/PR naar `main`.
