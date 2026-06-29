# Google Sheets ↔ Supabase veldmetingen

EarthGND ondersteunt **twee richtingen** tussen je spreadsheet en Supabase.

---

## 1. Sheet → Supabase (import)

Gebruik dit voor historische metingen of handmatige invoer in Google Sheets.

### Stappen voor jou

1. **Supabase migraties** — voer uit in SQL editor (volgorde in `docs/supabase-migrations.md` + `supabase/knowledge_production_migration.sql`).

2. **Import API-key** — in Vercel / `.env.local`:
   ```env
   IMPORT_API_KEY=<lang random geheim>
   SOIL_KNOWLEDGE_ACTIVE=true
   ```

3. **Google Apps Script** — kopieer `docs/google-sheets-import.gs` naar je spreadsheet:
   - Extensions → Apps Script
   - Plak het script
   - Vervang `EARTHGND_IMPORT_URL` en `IMPORT_API_KEY`
   - Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)

4. **Spreadsheet-kolommen** (rij 1 = headers):

   | Kolom | Veld | Verplicht |
   |-------|------|-----------|
   | A | external_import_id (uniek, bijv. rij-nummer) | ja |
   | B | straatnaam | nee |
   | C | huisnummer | nee |
   | D | postcode | ja |
   | E | woonplaats | nee |
   | F | lat | nee |
   | G | lon | nee |
   | H | field_gw_depth | nee |
   | I | bro_litho_class (1–5) | nee |
   | J | bro_gw_depth | nee |
   | K | measurement_quality (goed/twijfelachtig/onbruikbaar) | nee |
   | L | depth_curve JSON | ja |
   | M | notes | nee |

   `depth_curve` formaat:
   ```json
   [{"depth":3,"ra":31.0},{"depth":6,"ra":9.2}]
   ```

5. **Trigger** — in Apps Script: functie `importSelectedRows` of time-driven trigger elk uur.

6. **Seed kalibratie** (optioneel):
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
