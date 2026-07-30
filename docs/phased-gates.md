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

**Admin UI:** `/admin/moat/shadow` (Sprint 4) — resolved/unresolved + mean relative error. CLI: `npm run gate:poort2` (indien geconfigureerd) / `scripts/gate-poort2-shadow.ts`.

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
| Admin observability | `/admin/pipeline` + `/admin/moat/shadow` (Sprint 4) |

---

## Moat visibility — Sprint 1 (data spine) ✅ code

**Doel:** voorspellingsfouten + regionale confidence leesbaar maken (directeur-taal).

| Criterium | Bron |
|-----------|------|
| Accuracy columns op `pendiepte_metingen` | `supabase/moat_data_spine_migration.sql` |
| `regional_signatures` + refresh RPCs | zelfde migratie |
| Moat Index / geographic / growth | `calculate_moat_index`, `moat_geographic_strength`, `moat_growth_trajectory` |
| Admin leesbaar | `/admin/moat`, `docs/moat-data-dictionary.md` |

**Operator:** migratie draaien → `/admin/moat` → Herbereken.

### Sprint 2 — Directeur dashboard ✅ code

| Criterium | Bron |
|-----------|------|
| Product vs moat taal | `lib/moat/labels.ts`, label-migratie |
| Board view (index + componenten + geo + print) | `/admin/moat` |
| Concurrentiepositie (kwalitatief) | zelfde pagina |

### Sprint 3 — Sales + Ops ✅ code

| Criterium | Bron |
|-----------|------|
| Sales battlefield (adres → regio + nearby outcomes + pitch) | `/admin/moat/sales`, `GET /api/admin/moat/sales` |
| Ops funnel / weekly / regio-gezondheid | `/admin/moat/ops`, `GET /api/admin/moat/ops` |
| Geen nieuwe migratie | hergebruikt Sprint 1 spine |

### Sprint 4 — Integration ✅ code

| Criterium | Bron |
|-----------|------|
| Outcome drill-down + calculation links | `/admin/moat/outcomes`, Sales/Ops links |
| Shadow / Poort-2 admin | `/admin/moat/shadow` over `shadow_predictions` |
| Wekelijkse ops digest | `GET /api/admin/moat/cron/digest` (ma 07:00 UTC) |
| Geen nieuwe migratie | hergebruikt bestaande tabellen |

---

## Aanbevolen volgorde bij release

1. `npm test` + `npm run build` groen
2. Supabase migraties (zie `docs/supabase-migrations.md`)
3. Poort 2: accumulate shadow + veldmetingen (Orkaden e.d.)
4. `npm run gate:depth` — geoMean factor ≤ 1.30 per locatie
5. Poort 3 OOS review → eventueel `SOIL_KNOWLEDGE_ACTIVE=true` in staging
6. Poort 4 productiebeslissing → `empirical_weight`
7. Moat spine: `moat_data_spine_migration.sql` + `/admin/moat`
