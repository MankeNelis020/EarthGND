# Poort 3 — Out-of-sample validation

## Goal

Prove empirical posteriors are non-inferior (or better) than theory-only **before** any production weight.

## Method

Leave-one-site-out, grouped by **physical site** (not electrode):

1. Hold out one site
2. Train empirical LevelEstimate on remaining sites (same lithology)
3. Predict held-out ρ via L1 + empirical `computeSafePosterior`-style blend
4. Compare MAE/MAPE vs theory baseline

## Thresholds

Single source: `lib/evidence-lab/gate-config.ts` → `POORT3`.

Passing technical gates ⇒ status `PASSING_TECHNICAL_GATES` / `ELIGIBLE_FOR_HUMAN_REVIEW`.

**Never** auto-sets `SOIL_KNOWLEDGE_ACTIVE` or production empirical weight.

## CLI

```bash
npm run gate:poort3-oos
```

Exit codes: `0` technical pass, `1` fail, `2` insufficient data, `0` skip if no Supabase env.

## Uncertainty calibration

`minUncertaintyCalibration` is `null` / **REQUIRES REVIEW** until a calibration study defines it.
