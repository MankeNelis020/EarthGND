# Een nieuw endpoint toevoegen (het enige ondersteunde pad)

Dit document is wat CI naar je verwijst als `check-route-manifest.ts` of een
van de andere `scripts/architecture/check-*.ts`-poorten faalt. Er is precies
één manier om een nieuwe `app/api/**/route.ts` te bouwen. Deze route-tak
kende geen legacy toen hij geschreven werd — de drie voorbeelden hieronder
(`app/api/bro`, `app/api/pdf`, `app/api/mail`) zijn de eerste, echte,
werkende implementaties, niet hypothetische voorbeelden.

## De vier stappen

### 1. Registreer de capability

Open `lib/authz/capability.ts` en voeg een entry toe aan
`CAPABILITY_REGISTRY`. De naam is altijd `"<resource>:<actie>"`.

```ts
'colleague:invite': {
  description: 'Een collega uitnodigen om veldmetingen te doen.',
  allowedPrincipals: ['user'],
  entitlement: { type: 'none' },       // of 'requires-active-plan' / { type: 'consumes-credit', cost: 1 }
  requiresOwnership: false,             // true als de actie een bestaande, van-de-client-ID resource raakt
  rateLimit: { limit: 10, windowSeconds: 60, keyedBy: 'principal' },
  audit: true,
  idempotency: 'none',
},
```

Kies `entitlement` uit precies drie opties — verzin geen vierde zonder eerst
`docs/architecture/bro-charging-boundary.md` te lezen over waarom die keuze
altijd een expliciete, gedocumenteerde beslissing moet zijn, niet een
aanname:

- `{ type: 'none' }` — geen plan- of credit-eis.
- `{ type: 'requires-active-plan' }` — `plan !== 'gratis' || credits_left > 0`, schrijft niets af.
- `{ type: 'consumes-credit', cost: 1 }` — atomaire reserve/capture/release (huidige RPC ondersteunt alleen `cost: 1`).

`validateCapabilityRegistry()` draait automatisch bij elke import in
niet-productie — een ongeldige combinatie (bv. `anonymous` + ownership) gooit
meteen een exception, niet pas bij een audit.

### 2. Schrijf de use-case (geen route-code, geen HTTP)

In `lib/application/<naam>.ts`:

```ts
export const InviteColleagueInput = z.object({
  calculationId: z.string().uuid(),
  colleagueEmail: z.string().email(),
});
export type InviteColleagueInput = z.infer<typeof InviteColleagueInput>;

// Verplicht als requiresOwnership: true — server-side lookup, NOOIT een ID
// uit de body vertrouwen als "van mij".
export async function findColleagueInviteOwner(input: InviteColleagueInput): Promise<string | null> {
  const supabase = createClient(await cookies());
  return findCalculationOwnerId(supabase, input.calculationId);
}

export async function inviteColleague(
  ctx: AuthorizedContext<'colleague:invite'>,
  input: InviteColleagueInput,
): Promise<void> {
  // businesslogica hier — ctx.principal is al geverifieerd, credit is al
  // gereserveerd (indien van toepassing), ownership is al bevestigd.
}
```

Regels die hier gelden, niet optioneel:
- Geen `fetch()` naar een ander eigen route-bestand — roep de use-case-functie
  rechtstreeks aan (zie `app/api/rapport/[id]/sign` in de legacy-code voor het
  patroon dat je NIET moet overnemen: dat deed een HTTP-round-trip naar
  zichzelf met de service-role-key als bearer-token).
- Nooit een `results`/`inputValues`/`to`-achtig veld in het zod-schema dat
  door de client een "antwoord" of "ontvanger" laat dicteren. Als de use-case
  een eerder resultaat nodig heeft: een ID erbij, laad de rest server-side
  (`lib/domain/calculation-repository.ts` is het voorbeeld).

### 3. Bouw de route met `defineEndpoint`

```ts
// app/api/colleagues/invite/route.ts
export const POST = defineEndpoint({
  capability: 'colleague:invite',
  source: 'json',                       // of 'query' voor GET
  input: InviteColleagueInput,
  resourceOwner: findColleagueInviteOwner,   // TypeScript weigert te compileren zonder dit als requiresOwnership: true
  handler: async (ctx, input) => {
    await inviteColleague(ctx, input);
    return Response.json({ ok: true });
  },
});
```

Dit bestand mag niets anders bevatten. Geen `createClient`, geen
`SUPABASE_SERVICE_ROLE_KEY`, geen `if (!user) return 401`. Als je die
neiging voelt, hoort de logica in de use-case (stap 2).

### 4. Draai de verificatie lokaal vóór je een PR opent

```bash
npm run verify:architecture
```

Dit draait, in volgorde: route-manifest (gebruikt je nieuwe route
`defineEndpoint`?), importgrenzen, service-role-isolatie,
escape-hatch-scan, allowlist-krimp-check, en alle contract-tests. Faalt één
ervan, dan faalt CI met dezelfde melding.

## Machine-principals (webhook / cron / service)

Niet elk endpoint heeft een gebruiker. Voor een nieuwe cron-job of webhook is
er geen apart mechanisme nodig — declareer gewoon `allowedPrincipals:
['cron']` in de registry; `AuthorizedContext.authorize()` roept dan
`resolveCronPrincipal()` aan (Bearer CRON_SECRET, constant-time vergeleken,
faalt hard als CRON_SECRET niet is geconfigureerd — geen "if (secret)"
-sluiproute meer mogelijk, dat was bevinding B11).

Voor Stripe/Slack-webhooks ligt de signature-verificatie in
`lib/authz/resolvers.ts` (`resolveStripeWebhookPrincipal`,
`resolveSlackWebhookPrincipal`) — deze hebben de raw body nodig vóór
`request.json()` ooit wordt aangeroepen. Zie het voorbeeld-dispatchpatroon in
`app/api/pdf/route.ts` (twee `defineEndpoint`-aanroepen achter één
`request.clone()`-peek) als je één URL voor twee principal-soorten of
capabilities moet bedienen.

## Wat NOOIT door de review komt

- Een route die zelf `createClient` uit `@supabase/supabase-js` importeert
  (`scripts/architecture/check-import-boundaries.ts` blokkeert dit).
- Een letterlijke verwijzing naar `SUPABASE_SERVICE_ROLE_KEY` buiten
  `lib/authz/service-client.ts` (`check-service-role-isolation.ts`).
- Een nieuwe regel in `lib/authz/legacy-routes.ts` voor een NIEUW endpoint
  (`check-allowlist-shrinks.ts` — die lijst is uitsluitend voor routes die al
  vóór deze migratie bestonden).
- `as any`, `@ts-ignore` of `@ts-expect-error` in `lib/authz/**`,
  `lib/edge/**`, `lib/application/**` of `lib/domain/**` zonder een
  `// SECURITY-REVIEWED: <reden>`-regel (`check-escape-hatches.ts`).
