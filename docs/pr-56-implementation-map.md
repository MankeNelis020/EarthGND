# PR #56 — Implementation map

## Adaptations to EarthGND reality

- **No organization table.** Tenant = `profiles.id` / `user_id`. UI may say “organisatie” (company_name).
- **Project = diepte `calculations` row** (`rapport_naam` + optional `pendiepte_metingen`). Unused SQL `projects` table is not activated.
- **Existing `klic_meldingen`** stays for NEN 1010 field evidence. Prep-stage KLIC uses new `klic_requests` linked to `calculation_id`.
- **No Dialog/toast library** — inline modals (dashboard pattern). Feedback via inline banners.
- **Entitlements** — extend `lib/plans.ts` via `lib/entitlements.ts` (`canUseFeature`).
- **BMKL** — provider seam + stub only; `KLIC_BMKL_ENABLED=false` by default. Manual provider is production path.

## 1. Existing relevant pieces

| Area | Path |
|------|------|
| Calc persist | `lib/persist-calculation.ts`, `/api/diepte/calculate` |
| Project naming | `calculations.rapport_naam`, `/api/calculations/[uuid]/draft` |
| Monteur notify | `/api/calculations/[uuid]/notify` |
| Meting | `pendiepte_metingen`, MonteurForm |
| Legacy KLIC (NEN) | `klic_meldingen`, `/api/klic`, KlicForm |
| Plans | `lib/plans.ts`, Stripe webhook |
| Profile/settings | `profiles`, SettingsForm, `/instellingen` |
| Dashboard phases | calc → meting → rapport |
| Migrations docs | `docs/supabase-migrations.md` |

## 2. Extended

- `calculations` — execution date + contractor + override columns
- `profiles` — KLIC readiness policy columns
- Dashboard — werkvoorbereiding section + attention
- Settings — KLIC policy + Kadaster integration card
- Soft-gate before “start veldmeting” / mail monteur when policy on

## 3. New entities

- `klic_integrations` (per user/org credentials metadata — no plaintext secrets)
- `klic_requests` (lifecycle status per calculation)

## 4. Migrations

- `supabase/work_preparation_klic_migration.sql`

## 5. API routes

- `GET/PATCH /api/calculations/[uuid]/preparation`
- `GET/POST /api/calculations/[uuid]/klic`
- `POST /api/calculations/[uuid]/klic/manual`
- `POST /api/calculations/[uuid]/klic/refresh`
- `GET/DELETE /api/integrations/klic`
- `POST /api/integrations/klic/connect`
- `POST /api/integrations/klic/verify`
- `PATCH /api/profile/klic-policy`

## 6. UI

- `/[locale]/project/[uuid]/voorbereiding`
- `components/work-preparation/*`
- Settings KLIC sections
- Dashboard prep rows / attention

## 7. Tests

- `scripts/tests/work-preparation-*.ts` (readiness, deadlines, entitlements, errors)
- `npm run test:work-prep`
