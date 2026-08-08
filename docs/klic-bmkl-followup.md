# KLIC BMKL — follow-up (blocked)

Live Kadaster BMKL integration is intentionally **not** activated in PR #56.

## Why

Official BMKL REST exists and requires Kadaster/eHerkenning setup per organisation.
EarthGND must **not** invent:

- OAuth / refresh flows
- endpoints or request schemas
- SEPA / payment redirects
- webhooks / callbacks
- multi-tenant credential delegation

## Current seam

| Piece | Status |
|-------|--------|
| `lib/klic/provider.ts` | Abstraction |
| `ManualKlicProvider` | Production-safe default |
| `DevMockKlicProvider` | Local/CI |
| `KadasterBmklProvider` | Stub — refuses network until configured |
| `KLIC_BMKL_ENABLED` | `false` by default |

## Before enabling live BMKL

1. Obtain official BMKL technical specification and auth model.
2. Implement per-organisation credential storage (encrypted vault; never client-readable).
3. Map geometry / excavation area with explicit user confirmation.
4. Confirm Kadaster bills the customer organisation directly.
5. Add idempotency using any official Kadaster key if available.
6. Integration tests against Kadaster sandbox with real org credentials.

## Operator migration

Apply `supabase/work_preparation_klic_migration.sql` (see `docs/supabase-migrations.md`).
