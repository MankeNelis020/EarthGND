# Evidence & Calibration Lab

Admin instrument panel: `/admin/evidence-lab`

## Why shadow mode exists

Production must stay theory-only (L1) until out-of-sample evidence shows empirical priors do not hurt predictions. Shadow logs what theory predicted; field metingen backfill ground truth without changing live ρ.

## Current production behavior

| Env | Live ρ |
|-----|--------|
| `SOIL_KNOWLEDGE_ACTIVE` unset/false | L1 literature only → **0% empirical** |
| `=true` | Blend with `EMPIRICAL_WEIGHT` (default 0.1) — **not** flipped by this Lab |

The Lab shows three layers per lithology:

1. **Theory** — L1 `priors.ts`
2. **Bayesian evidence posterior** — AUTO weight from precision `p = n/σ²`
3. **Production active** — what EarthGND actually uses (still L1 while flag off)

AUTO ≠ PRODUCTION.

## Site independence

`unique_site_n` clusters by `siteKey` (adres/plaats) or ~75 m radius. Soft DB `total_weight` is unchanged; Lab also shows `soft_n_site_adjusted`.

## GeoTOP validation

Independent geology via `lib/geotop.ts`. Lithology never inferred from ρ. Distribution mapping: `lib/evidence-lab/geotop-mapping.ts` (separate from production `klasToLithoClass`).

## Gates

| Gate | Command | Meaning |
|------|---------|---------|
| Poort 2 depth | `npm run gate:depth` | geoMean ≤ 1.30 |
| Poort 2 shadow | `npm run gate:poort2` | informational |
| Poort 3 OOS | `npm run gate:poort3-oos` | leave-one-site-out; **not** production approval |

## Manual simulation

Client-side blend `ρ = theory×(1−w)+emp×w`. Never writes production.

## Migration

`supabase/evidence_calibration_lab_migration.sql`

## Auth

Same as moat: logged-in + `ADMIN_EMAILS`.

## Safety

**Production prediction behavior remains unchanged** by Lab UI/jobs. Policy rows store intent only; live activation still requires explicit env ops outside auto-approval.
