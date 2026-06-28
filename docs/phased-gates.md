# Gefaseerde poorten — EarthGND

Acceptatiecriteria voor het gefaseerde validatieplan. Poort 1 + P1 zijn afgerond op `main`.

---

## Poort 1 — Trust foundation ✅

**Doel:** gebruiker en monteur kunnen outputs vertrouwen zonder stille regressies.

| Criterium | Bron |
|-----------|------|
| RCD = UL/IΔn (geen hardcoded 166) | `docs/contracts.md` §A |
| `calculations.input_values` / `result` | §B |
| Scan-prefill via `getScanContext()` | `lib/scan-context.ts` |
| Golden-set groen | `npm run golden-set` |

---

## P1 — Leidingwerk ✅

**Doel:** productie-ρ en risico volgen pipeline, niet BRO `dominantRho`.

| Criterium | Bron |
|-----------|------|
| Gelaagd pad via `calcLayeredRhoEffectiveNl` | `lib/pipeline/effective-rho.ts` |
| UI effectieve ρ | `DiepteCalculator`, `PostcodeInput` |
| `risicoklasse` gepersisteerd | `/api/diepte/calculate` |
| Parallel alleen bij indrijfbaarheid of opt-in | `docs/contracts.md` §D |

---

## Poort 2 — Shadow mode + veldmetingen 🔄

**Doel:** elke diepteberekening logt theorie; confirmed metingen vullen ground truth.

| Criterium | Implementatie |
|-----------|---------------|
| Shadow insert per calculate | `logShadowPrediction()` in calculate route |
| `actual_rho` backfill bij confirm | `backfillShadowFromMeting()` in `processMeting` |
| Evidence → L2/L3 Welford | `lib/soil-knowledge/evidence-accumulator.ts` |
| Diepte gate < +30% geoMean | `npm run gate:depth` (velddata + BRO-cache) |

**Nog niet:** geautomatiseerde Poort-2 dashboard; handmatige review van `shadow_predictions` met `actual_rho IS NOT NULL`.

---

## Poort 3 — Empirische prior (OOS) ⏸

**Doel:** `SOIL_KNOWLEDGE_ACTIVE=true` alleen na out-of-sample validatie.

| Criterium | Status |
|-----------|--------|
| Flag default uit | `lib/soil-knowledge/active-prior.ts` |
| `empirical_weight = 0` in shadow | `shadow-logger.ts` |
| Holdout-split velddata | `lib/calibration/field-data.ts` (5 locaties) |
| OOS script met exit code | Toekomst: `gate:poort3-oos` |

**Niet doen vóór Poort 3:** live `rhoWetOverride` uit L2/L3 in productie.

---

## Poort 4 — Productie empirisch gewicht ⏸

**Doel:** posterior beïnvloedt live ρ met gecontroleerd gewicht.

| Criterium | Status |
|-----------|--------|
| `empirical_weight > 0` beslissing | schema-kolom aanwezig, code pinned op 0 |
| L4 lokale observaties | types/schema only |
| Admin observability | pipeline-status admin, geen shadow-metrics UI |

---

## Aanbevolen volgorde bij release

1. `npm test` + `npm run build` groen
2. Supabase migraties (zie `docs/supabase-migrations.md`)
3. Poort 2: accumulate shadow + veldmetingen (Orkaden e.d.)
4. `npm run gate:depth` — geoMean factor ≤ 1.30 per locatie
5. Poort 3 OOS review → eventueel `SOIL_KNOWLEDGE_ACTIVE=true` in staging
6. Poort 4 productiebeslissing → `empirical_weight`
