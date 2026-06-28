# Supabase migraties — volgorde

Pas toe op een lege of bestaande project-DB in deze volgorde. Maak vóór productie altijd een backup.

## 1. Basis

| Bestand | Inhoud |
|---------|--------|
| `supabase/schema.sql` | profiles, calculations (legacy kolomnamen), basis RLS |

## 2. Canonical calculations (Poort 1)

| Bestand | Inhoud |
|---------|--------|
| `supabase/rename_calculations_columns.sql` | `input`→`input_values`, `resultaat`→`result` |
| `supabase/ensure_calculations_canonical.sql` | Idempotent fix if monteur/ID persist fails (schema cache) |

Na migratie schrijft de app alleen `input_values` / `result`. `getScanContext()` leest legacy als fallback.

## 3. Feature-schema's

| Bestand | Inhoud |
|---------|--------|
| `supabase/pendiepte_meting_schema.sql` | Monteur-metingen, depth_curve |
| `supabase/opleverrapport_schema.sql` | inspection_reports |
| `supabase/soil_knowledge_schema.sql` | soil_evidence, global/regional_prior, shadow_predictions |
| `supabase/fix_prior_rls_and_constraints.sql` | RLS policies service role |

## 4. Overige patches

Controleer `supabase/` op aanvullende `.sql` bestanden en pas toe na de bovenstaande basis, in commit-datumvolgorde indien afhankelijk.

## Live schema-check

Verwachte kolommen `calculations`:

- `input_values` (jsonb)
- `result` (jsonb)
- `risicoklasse` (text, nullable)
- **Geen** legacy `input` / `resultaat` (na volledige migratie)

Types worden handmatig bijgehouden in `lib/types/rapport.ts` en `lib/soil-knowledge/types.ts`. Genereer desgewenst via `supabase gen types` en merge incrementeel.
