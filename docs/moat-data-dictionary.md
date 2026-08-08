# Data Dictionary: Moat spine

**Canonical migration:** `supabase/moat_data_spine_migration.sql`  
**Label fix (Sprint 2):** `supabase/moat_labels_sprint2_migration.sql`  
**Admin UI:** `/admin/moat` · `/sales` · `/ops` · `/outcomes` · `/shadow`  
**API:** `GET/POST /api/admin/moat` · `/sales` · `/ops` · `/outcomes` · `/shadow` · cron `/api/admin/moat/cron/digest`

---

## Product ≠ moat

| Laag | Betekenis |
|------|-----------|
| **Product** | Dwight + BRO (+ L2/L3/L4 priors). **Overal in NL beschikbaar** — ook zonder lokale veldmetingen. |
| **Moat** | Bewijs uit confirmed *outcomes* (voorspeld vs gemeten). Nodig om een **regionale data-claim** te staven, niet om de calculator te mogen gebruiken. |

Verbetering van de voorspelling gebeurt op twee sporen (los van de moat-score):
1. **Lokaal** — precedenten in de buurt (L4)
2. **Grondsoort** — Ω·m / klasse-priors (L2/L3)

---

## Ground truth vs oude roadmap-taal

| Roadmap term | Live EarthGND mapping |
|--------------|------------------------|
| `diepte_aanbeveling` | `calculations.result.dimension` → `predicted_depth_m` |
| Actual depth / Ra | `installed_depth` / `achieved_ra` |
| “Sellable ≥70%” | **Moat claim ready** (niet: product mag verkocht worden) |
| ST_CLUSTERKMEANS | Named NL boxes via `moat_region_for_coords()` |

---

## `confidence_score` (0–1) → moat-status

```
min(1, (n/20) × (1 / (1 + std_error%/100)) × link_factor)
```

| Score | Moat-status | Data-claim |
|-------|-------------|------------|
| ≥0.85 | Moat bewezen | Premium data-claim |
| ≥0.70 | Moat ontstaat | Standaard data-claim |
| ≥0.50 | Outcomes verzamelen | Pilot data-claim |
| &lt;0.50 | Te dun voor claim | Nog geen data-claim |

`regional_signatures.sellable` is een **legacy kolomnaam** = `confidence ≥ 0.70` (moat claim ready).

---

## RPCs

| Function | Answers |
|----------|---------|
| `calculate_moat_index()` | Volume + confidence + empirical → 0–10 |
| `moat_geographic_strength()` | Per regio moat-status + data-claim tier |
| `moat_growth_trajectory()` | Maandelijkse outcomes → 500 |

---

## Sprint 3 — Sales + Ops (geen nieuwe SQL)

| Surface | Doel |
|---------|------|
| `/admin/moat/sales` | Geocode klantadres → named regio + nearby outcomes (default 2 km) + pitchregel |
| `/admin/moat/ops` | Funnel (outcomes → prediction-link → dieptefout → knowledge) + wekelijkse teller + regio-gezondheid |

Bron: `pendiepte_metingen` + `regional_signatures` (zelfde spine als Sprint 1). Radius sales is breder dan L4 (2 km vs 500 m) — pitch-context, geen ρ-prior.

---

## Sprint 4 — Integration (geen nieuwe SQL)

| Surface | Doel |
|---------|------|
| `/admin/moat/outcomes` | Drill-down op regio / week / category / unlinked; link naar `/pendiepte-rapport/{calculation_id}` |
| `/admin/moat/shadow` | Poort-2 review over `shadow_predictions` (resolved vs unresolved, mean rel. error) |
| Cron `0 7 * * 1` | Wekelijkse ops digest naar `ADMIN_EMAILS` via Resend (`CRON_SECRET`) |

Geen `pipeline_events`-tabel — bronnen blijven `pendiepte_metingen`, `regional_signatures`, `shadow_predictions`.

---

## Operator

1. `moat_data_spine_migration.sql` (eenmalig, al gedaan)
2. `moat_labels_sprint2_migration.sql` (labelteksten in RPC)
3. Redeploy → `/admin/moat` → Print/PDF voor board; Sales / Operations via nav
4. **Herbereken** na nieuwe confirmed metingen
