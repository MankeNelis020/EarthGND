# Evidence & Calibration Lab — pre-coding reconciliation

Status as of branch `cursor/evidence-calibration-lab-d8ca` (from `main` @ sandbox #55).

## Current real production behavior

| Claim in brief | Reality |
|----------------|---------|
| `SOIL_KNOWLEDGE_ACTIVE` default off | **True.** Only active when env === `'true'` (`lib/soil-knowledge/sheet-sync.ts`). |
| Production prior = L1 literature | **True when flag off.** `resolveActivePrior` returns `l1_literature` / `NL_RHO_WET_PRIOR`. |
| `empirical_weight = 0` in production | **Partially true.** Shadow column always logs `0`. Pipeline blend uses **`EMPIRICAL_WEIGHT` env default `0.1`** *only if* knowledge is active + class enabled + confidence OK. With flag off, live empirical influence is **effectively 0%**. |
| Poort 2 shadow active | **True.** `logShadowPrediction` on calculate; backfill on meting confirm. |
| Poort 3 OOS complete | **False.** No `gate:poort3-oos`. Closest: offline `validate:poort-c` LOLO (conductive). |
| Poort 4 controlled activation | **Partial.** Env knobs exist (`EMPIRICAL_WEIGHT`, `ENABLED_CLASSES`, …). No per-lithology policy table, wizard, or audit log. |

## Contradictions / stop-and-report items

### 1. Empirical weight semantics (CRITICAL — do not silently “fix”)

- Brief assumes production empirical influence is **0%** and a single weight concept.
- Code has **three** different notions:
  1. Shadow DB column `empirical_weight` — always **0**
  2. Env `EMPIRICAL_WEIGHT` — default **0.1** when knowledge active
  3. Bayesian AUTO weight from precision blend — **not used in production**

**Lab rule:** show all three distinctly. Never imply Bayesian AUTO = production. Do not change defaults of `getEmpiricalWeight()` or flip `SOIL_KNOWLEDGE_ACTIVE` in this work.

### 2. Config comment vs code

`lib/soil-knowledge/config.ts` header comments claim staging defaults `SOIL_KNOWLEDGE_ACTIVE=true`. Code default is **off**. Lab / docs will state code truth.

### 3. Site independence missing

`evidence-accumulator` soft_n = Σ P(class\|ρ) × confidence per wet depth point. **No site clustering.** Multiple electrodes / depths at one address inflate soft_n. Lab must expose `raw_n`, `soft_n`, `unique_site_n` and use **site-grouped OOS**. Do not silently rewrite accumulator soft_n in this PR (would change learning dynamics); document and use site metrics for gates.

### 4. Soft class from ρ vs GeoTOP independence

Accumulator **does** infer class probability from ρ_apparent (learning soft assignment). Brief forbids inferring lithology from ρ for **GeoTOP validation**. Keep those paths separate: GeoTOP class comes only from geology provider + mapping distribution.

### 5. GeoTOP mapping is hard 1:1 today

`lib/geotop-config.ts` `klasToLithoClass` maps each GeoTOP code to a single EarthGND class. Brief wants distribution over classes. Lab adds a **separate** validation mapping; production BroDepthSample path unchanged.

### 6. Poort 2 gate is soft

`gate:poort2` is informational (DB health). Hard depth gate is `gate:depth` (geoMean ≤ 1.30). Lab must surface both statuses honestly (PASS / FAIL / NOT ENOUGH DATA).

### 7. Admin surfaces exist but are not the Lab

`/admin/moat`, `/admin/moat/ops|sales`, `/admin/pipeline`, `/admin/soil-monitoring`. No `/admin/evidence-lab`. Sprint 4 shadow page may not be on this `main` tip.

### 8. Bayesian double-counting caveat already documented

`bayesian-posterior.ts` warns L2+L3+L4 share evidence. Production/shadow use `computeSafePosterior` (L1 + finest). Lab AUTO weights for display use **L1 theory vs L2 empirical (or finest available)** explicitly — not unsafe multi-level blend.

## Safety commitment for this implementation

1. No change to Dwight formulas, L1 priors μ/σ/nVirtual, or production `resolveActivePrior` / kernel blend path.
2. Lab UI and jobs default **read-only / dry-run**; activation writes policy rows + audit only, never auto-sets `SOIL_KNOWLEDGE_ACTIVE`.
3. Gravel (`lithoClass=4`) remains learning-blocked.
4. Manual simulator is client/server simulation only — never writes production overrides.

## Implementation mapping (brief → repo)

| Brief part | Approach |
|------------|----------|
| A–E cockpit / Bayes / formulas / layers / simulator | New `/admin/evidence-lab` + `lib/evidence-lab/*` |
| F–I litho cards, GeoTOP validation, site clustering, mapping | New tables + jobs; reuse `lib/geotop.ts`, `reverse-engine.ts` |
| J–L Poort 2/3 | Wire `gate:depth` + `gate:poort2` into Lab; add `gate:poort3-oos` |
| M–N Poort 4 policy + wizard | `empirical_weight_policy` + audit; defaults shadow/disabled |
| O–T location lab, gauges, explorer, formulas | Admin UI sections |
| U reprocessing jobs | Admin API wrappers around existing reprocess + new GeoTOP backfill |
| V–Y safety, tests, docs | Explicit tests + docs listed in brief |
