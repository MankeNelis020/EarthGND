# Stripe pricing — synchronisatie met de app

Alle **getoonde bedragen** staan in `lib/plans.ts`. Stripe regelt alleen de **afrekening** via Price IDs.

## Stappen bij prijswijziging

1. **Stripe Dashboard** → Products → maak **nieuwe Price** aan (Stripe raadt aan oude prices te archiveren i.p.v. te wijzigen).
2. **Vercel / `.env`** → update de bijbehorende `STRIPE_PRICE_*` variabele naar het nieuwe Price ID.
3. **`lib/plans.ts`** → pas `prijs` en `credits` aan zodat UI en webhook hetzelfde bedrag/credits toekennen.
4. **Deploy** → pas daarna pas live prijzen aan in productie.

## Env-variabelen

| Variabele | Plan / product |
|-----------|----------------|
| `STRIPE_PRICE_STARTER` | Starter abonnement (€39/mnd, 10 credits) |
| `STRIPE_PRICE_BASIC` | Basic abonnement (€80/mnd, 50 credits) |
| `STRIPE_PRICE_PRO` | Pro abonnement (€129/mnd, 150 credits) |
## Losse credits — schuif (staffel)

Losse credits worden via een **schuif 1–100** verkocht. De staffel staat in `lib/credit-slider.ts` (ankerpunten uit `lib/plans.ts`):

| Credits | Totaal | Stukprijs |
|---------|--------|-----------|
| 1 | €5,95 | €5,95 |
| 10 | €50,00 | €5,00 |
| 50 | €99,00 | €1,98 |
| 51–100 | × €1,98/st | €1,98 |

Checkout gebruikt **Stripe `price_data`** (dynamisch bedrag) + metadata `creditCount`. Geen aparte Stripe Price per schuifstand nodig.

Legacy env vars `STRIPE_PRICE_CREDIT_*` zijn optioneel (vaste packs); de schuif werkt zonder.

Ook vereist: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Huidige bedragen (lib/plans.ts)

| Product | Prijs | Credits |
|---------|-------|---------|
| Starter | €39/mnd | 10 |
| Basic | €80/mnd | 50 |
| Pro | €129/mnd | 150 |
| Los 1 credit | €5,95 | 1 |
| Los 10-pack | €50 | 10 |
| Los 50-pack | €99 | 50 |

**Let op:** wijzig je alleen het bedrag in Stripe zonder `plans.ts` + env + deploy, dan klopt de website niet met wat er wordt afgerekend.
