# Data Dictionary: Moat spine (Sprint 1)

**Canonical migration:** `supabase/moat_data_spine_migration.sql`  
**Admin UI:** `/admin/moat` · **API:** `GET/POST /api/admin/moat`

This is the moat materialized. It answers: *How good are our predictions, by region and soil?*

---

## Ground truth vs roadmap wish-list

| Roadmap term | Live EarthGND mapping |
|--------------|------------------------|
| `diepte_aanbeveling` | `calculations.result.dimension` → denormalized as `predicted_depth_m` |
| Actual depth | `pendiepte_metingen.installed_depth` |
| Actual Ra | `pendiepte_metingen.achieved_ra` |
| Empirical % | From `calculations.result` blend fields when `calculation_id` present |
| ST_CLUSTERKMEANS | **Not used** — named NL lat/lon boxes via `moat_region_for_coords()` |
| Imports without calc | Prediction errors stay NULL + note (honest gap) |

---

## `pendiepte_metingen` — new calculated columns

| Column | Meaning |
|--------|---------|
| `predicted_depth_m` | Dwight recommendation at confirm/import time (from linked calculation) |
| `predicted_ra_ohm` | Predicted Ra from calculation |
| `depth_error_m` | `installed_depth − predicted_depth_m` |
| `depth_error_percent` | Error as % of predicted |
| `ra_error_ohm` / `ra_error_percent` | Same for Ra |
| `prediction_accuracy_category` | `excellent` (≤10%) / `good` (≤20%) / `acceptable` (≤35%) / `miss` / `unknown` |
| `data_quality_score` | 0–1 completeness (depth, Ra, curve, GPS, prediction link) |
| `is_outlier` | \|error%\| > μ+3σ within region (n≥5) |
| `blend_applied` | Calc used empirical ρ wet override |
| `empirical_contribution_percent` | 0–100 proxy from blend confidence / source |
| `regional_cluster_id` | Named region e.g. `Amsterdam`, `Veluwe` |
| `regional_confidence` | Synced from `regional_signatures.confidence_score` |
| `last_calculated_at` | Last refresh |
| `calculation_notes` | Why NULL prediction / stopreden caveat |

**Refresh:** `select refresh_moat_meting_metrics();` or `select refresh_regional_signatures();` (does both).

---

## `regional_signatures`

Each row = **region × soil_type** cluster.

### `confidence_score` (0–1)

```
min(1, (n/20) × (1 / (1 + std_error%/100)) × link_factor)
```

- `link_factor = 0.35` if no linked predictions (imports-only), else `1`
- **&lt;0.50** Building — don’t sell  
- **0.50–0.70** Pilot  
- **0.70–0.85** Standard sell (caveats)  
- **≥0.85** Premium  

### `empirical_percentage`

Average empirical contribution when known. Low until Poort D blend is widely on.

### `first_try_success_rate`

% of rows with a known accuracy category that are not `miss`.

### `sellable` / `recommended_pricing_tier`

Derived from confidence: `premium` / `standard` / `pilot` / `building`.

---

## RPCs (dashboard queries)

| Function | Answers |
|----------|---------|
| `calculate_moat_index()` | Volume + confidence + empirical → score 0–10 |
| `moat_geographic_strength()` | Per-region readiness + pricing tier |
| `moat_growth_trajectory()` | Monthly counts + cumulative toward 500 |

---

## How to use

**Q: Can we sell in Amsterdam?**  
→ `select * from moat_geographic_strength() where region_name = 'Amsterdam';`

**Q: Where are blind spots?**  
→ `select region_name, confidence_score from regional_signatures where confidence_score < 0.5;`

**Q: What’s our moat strength?**  
→ `select calculate_moat_index();`

**Q: Why is depth error weird on Lelystad?**  
→ Check `stopreden` + `calculation_notes` — vastgelopen ≠ model miss.

---

## Operator checklist

1. Run `supabase/moat_data_spine_migration.sql` in Supabase  
2. Confirm `select * from regional_signatures limit 20;`  
3. Open `/admin/moat` (email in `ADMIN_EMAILS`)  
4. Click **Herbereken signatures** after new confirmed metingen  
5. Manual data: verify `elektrode_diameter_mm` / `stopreden` before trusting ρ / depth errors for L2/L3  

---

## Out of scope (later sprints)

- Board PDF / Realtime Moat Index card (Sprint 2)  
- Sales “similar projects” UX (Sprint 3)  
- `pipeline_events` alerting spine (Sprint 4)  
