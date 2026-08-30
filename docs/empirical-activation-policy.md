# Empirical activation policy (Poort 4)

## Model

Table `empirical_weight_policy` (per litho_class 1–5):

| Field | Default |
|-------|---------|
| mode | `shadow` |
| enabled | `false` |
| empirical_cap_percent | 30 |
| poort3_required | true |

Modes: `shadow` | `auto` | `capped_auto` | `manual`.

### capped_auto

```
production_empirical = min(bayesian_auto%, cap%)
```

Example: Bayes 82%, cap 30% → production intent 30%.

## Governance

- Grind (`litho_class=4`) always blocked
- Wizard requires human confirm + reason → `evidence_lab_audit`
- Lab policy API **does not** flip `SOIL_KNOWLEDGE_ACTIVE`
- Live calc still uses env flags in `lib/soil-knowledge/config.ts`

## Effective live influence today

With flag off: **0% empirical** regardless of policy rows.

## Formula glossary

See Lab FORMULAS section / `lib/evidence-lab/formulas.ts`.
