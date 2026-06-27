-- Migration: voeg location_source, rd_x, rd_y toe aan pendiepte_metingen
-- Doel: canoniek locatieformaat zodat adres- en GPS-metingen beide
--       vindbaar zijn voor regionale priors en lokale observaties.
--
-- Uitvoeren in Supabase SQL-editor (of via psql):
--   psql -f location_fields_migration.sql

-- 1. Kolommen toevoegen
ALTER TABLE pendiepte_metingen
  ADD COLUMN IF NOT EXISTS location_source TEXT
    CHECK (location_source IN ('gps', 'address', 'manual_import', 'coordinates')),
  ADD COLUMN IF NOT EXISTS rd_x INTEGER,
  ADD COLUMN IF NOT EXISTS rd_y INTEGER;

-- 2. Index voor regionale zoekacties (grid 5 km)
CREATE INDEX IF NOT EXISTS pendiepte_metingen_rd
  ON pendiepte_metingen (rd_x, rd_y)
  WHERE rd_x IS NOT NULL AND rd_y IS NOT NULL;

-- 3. Backfill location_source op bestaande rijen
-- Noot: source_type bestaat pas na soil_knowledge_schema.sql; deze migratie
-- loopt eerder, dus we leiden 'manual_import' niet af uit source_type.
-- Bestaande manual-import rijen zijn er nog niet — die komen via het script
-- nadat soil_knowledge_schema.sql is uitgerold.
UPDATE pendiepte_metingen
SET location_source = CASE
  WHEN gps_accuracy_m IS NOT NULL          THEN 'gps'
  WHEN lat IS NOT NULL AND lon IS NOT NULL THEN 'coordinates'
  ELSE                                          'address'
END
WHERE location_source IS NULL;

-- 4. rd_x / rd_y blijven NULL voor bestaande rijen.
--    De API vult ze in bij elke volgende PATCH/POST.
--    Handmatige backfill (optioneel, vereist PostgreSQL met pl/pgsql):
--
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT id, lat, lon FROM pendiepte_metingen
--            WHERE lat IS NOT NULL AND lon IS NOT NULL
--              AND rd_x IS NULL LOOP
--     -- RD-approximatie (< 1 m in NL) — RDNAPTRANS white paper coefficients
--     DECLARE
--       dphi DOUBLE PRECISION := 0.36 * (r.lat - 52.15517440);
--       dlam DOUBLE PRECISION := 0.36 * (r.lon -  5.38720621);
--       x    DOUBLE PRECISION;
--       y    DOUBLE PRECISION;
--     BEGIN
--       x := 155000
--         + 190094.945 * dphi^0 * dlam^1
--         -  11832.228 * dphi^2 * dlam^1
--         -    144.221 * dphi^0 * dlam^3
--         -     32.391 * dphi^2 * dlam^3
--         -      0.705 * dphi^1 * dlam^0
--         -      2.340 * dphi^4 * dlam^1
--         -      0.608 * dphi^2 * dlam^5
--         -      0.008 * dphi^0 * dlam^7;
--       y := 463000
--         + 309056.544 * dphi^1 * dlam^0
--         +  22238.523 * dphi^1 * dlam^2
--         -     43.472 * dphi^3 * dlam^0
--         -  33995.354 * dphi^1 * dlam^4
--         -      0.551 * dphi^3 * dlam^2
--         -      2.956 * dphi^1 * dlam^6
--         +      0.076 * dphi^5 * dlam^0
--         -      0.049 * dphi^3 * dlam^4;
--       UPDATE pendiepte_metingen
--         SET rd_x = ROUND(x)::INTEGER, rd_y = ROUND(y)::INTEGER
--         WHERE id = r.id;
--     END;
--   END LOOP;
-- END;
-- $$;
