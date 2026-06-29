# Google Sheets ↔ Supabase veldmetingen

EarthGND ondersteunt **twee richtingen** tussen je spreadsheet en Supabase.

---

## 1. Sheet → Supabase (import)

Gebruik het **bestaande** Apps Script op tab `Metingen`. Canonieke versie in de repo: `docs/google-sheets-import.gs`.

### Spreadsheet-kolommen (tab `Metingen`)

| Kolom | Veld | Verplicht |
|-------|------|-----------|
| A | straatnaam | nee* |
| B | huisnummer | nee |
| C | postcode | aanbevolen |
| D | woonplaats | nee |
| E | lat | nee |
| F | lon | nee |
| G | field_gw_depth | nee |
| H | bro_litho_class (1–5) | nee |
| I | bro_gw_depth | nee |
| J | measurement_quality (goed/twijfelachtig/onbruikbaar) | nee |
| K | notes | nee |
| L–U | R_3m, R_6m, … R_30m (Ω) | min. 1 kolom |
| V | importstatus (automatisch) | — |
| W | Supabase meting_id (automatisch) | — |

\* Minimaal straatnaam **of** lat/lon **of** meetdata in L–U.

Dedup: het script stuurt `external_import_id` = `sheet:{postcode}:{huisnummer}` (of `sheet:row:{n}`). Dubbele rijen krijgen status `✓ al in Supabase`.

### Stappen voor jou

1. **Supabase migraties** — voer uit in SQL editor (volgorde in `docs/supabase-migrations.md` + `supabase/knowledge_production_migration.sql`).

2. **Import API-key** — in Vercel / `.env.local`:
   ```env
   IMPORT_API_KEY=<lang random geheim>
   SOIL_KNOWLEDGE_ACTIVE=true
   ```

3. **Apps Script** — plak `docs/google-sheets-import.gs` (of update je bestaande script met `external_import_id` + `buildExternalImportId`).

4. **Menu EarthGND** → *Stel API-sleutel in* (zelfde waarde als Vercel `IMPORT_API_KEY`).

5. **Import** → *Nu importeren* of *Activeer automatisch importeren (elke 5 min)*.

6. **Herimport** → *Statuskolommen legen (herimport)* wist kolom V/W; rijen worden opnieuw verstuurd (Supabase dedup voorkomt dubbele Welford als `external_import_id` gelijk blijft).

7. **Seed kalibratie** (optioneel):
   ```bash
   npm run import:metingen -- --seed
   ```

---

## 2. Supabase → Sheet (bevestigde monteur-metingen)

Wanneer een calculator een veldmeting **bevestigt**, stuurt EarthGND automatisch een POST naar:

```env
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
```

### Stappen voor jou

1. Maak een **tweede tab** `Veldmetingen_sync` in je spreadsheet.
2. Deploy een Apps Script Web App die POST JSON ontvangt (zie `docs/google-sheets-sync.gs`).
3. Zet `GOOGLE_SHEETS_WEBHOOK_URL` in Vercel op die Web App URL.

Payload bevat o.a.: `meting_id`, `postcode`, `huisnummer`, `installed_depth`, `depth_curve`, `lat`, `lon`.

---

## 3. Productie activeren

In Vercel (Production environment variables):

```env
SOIL_KNOWLEDGE_ACTIVE=true
SUPABASE_SERVICE_ROLE_KEY=<service role>
IMPORT_API_KEY=<geheim>
GOOGLE_SHEETS_WEBHOOK_URL=<optioneel, voor sync terug naar sheet>
```

**Herstart** de deployment na het zetten van env vars.

---

## 4. Controleren

- Na confirm monteur-meting: rijen in `soil_evidence`, `global_prior`, `regional_prior`.
- Nieuwe berekening op zelfde postcode: API response bevat `rhoWetSource` ≠ `l1_literature` (na ≥1 lokale meting).
- `localDepthHint` in calculate-response als eerdere metingen binnen 500 m.

SQL check:
```sql
select litho_class, total_weight, welford_mean, last_updated
from global_prior order by litho_class;

select count(*) from soil_evidence;
```

---

## 5. Veiligheid

- `IMPORT_API_KEY` nooit in client-side code of spreadsheet zichtbaar maken — alleen in Apps Script **Script Properties** (`PropertiesService.getScriptProperties()`).
- Service role key alleen server-side (Vercel env).
