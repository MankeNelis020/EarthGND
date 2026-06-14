-- ─── Bodemkaart 1:50.000 (PostGIS fallback) ──────────────────────────────────
--
-- GeoPackage download:
--   https://service.pdok.nl/tno/bro-bodemkaart/atom/downloads/BRO_DownloadBodemkaart.gpkg
--   (~146 MB, CC0, bijgewerkt oktober 2025)
--
-- De GeoPackage heeft een genormaliseerde structuur met meerdere tabellen:
--   areaofpedologicalinterest  → geometrie (kolom: geom)
--   soilarea                   → koppelt maparea_id aan vlak
--   soilarea_soilunit          → koppelt vlak aan bodemcode (soilunit_code)
--   soil_units                 → bevat de bodemcode (bv. "Hn21", "pVb")
--
-- IMPORT (vereist GDAL/ogr2ogr, b.v. via `sudo apt install gdal-bin`):
--
--   ogr2ogr -f PostgreSQL \
--     "PG:host=<db-host> port=5432 user=postgres password=<pw> dbname=postgres" \
--     BRO_DownloadBodemkaart.gpkg \
--     -nln public.bodemkaart \
--     -nlt MULTIPOLYGON \
--     -t_srs EPSG:28992 \
--     -lco GEOMETRY_NAME=geom \
--     -sql "SELECT a.geom, su.code AS bodemcode
--           FROM areaofpedologicalinterest a
--           JOIN soilarea sa ON sa.maparea_id = a.maparea_id
--           JOIN soilarea_soilunit sau
--             ON sau.maparea_id = sa.maparea_id
--            AND sau.soilunit_sequencenumber = 1
--           JOIN soil_units su ON su.code = sau.soilunit_code"
--
-- De -sql JOIN flatten t de genormaliseerde GeoPackage naar één vlakkenlaag
-- met alleen `geom` en `bodemcode`. Daarna dit script uitvoeren in Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists postgis;

-- Flat bodemkaart polygon table (geometry + soil code).
-- ogr2ogr creates this table; the CREATE below is a safe no-op if it exists.
create table if not exists public.bodemkaart (
  id       bigserial primary key,
  bodemcode text,
  geom     geometry(MultiPolygon, 28992)
);

-- Spatial index — essential for point-in-polygon queries
create index if not exists bodemkaart_geom_idx
  on public.bodemkaart using gist (geom);

create index if not exists bodemkaart_code_idx
  on public.bodemkaart (bodemcode);

-- Public reference data: no RLS needed
alter table public.bodemkaart disable row level security;

-- ─── RPC function ─────────────────────────────────────────────────────────────
-- Called from lib/bodemkaart.ts as: supabase.rpc('get_bodemkaart_at_point', {rd_x, rd_y})

create or replace function public.get_bodemkaart_at_point(rd_x float, rd_y float)
returns table (bodemcode text)
language sql
stable
security definer
as $$
  select b.bodemcode
  from public.bodemkaart b
  where ST_Contains(
    b.geom,
    ST_SetSRID(ST_MakePoint(rd_x, rd_y), 28992)
  )
  limit 1;
$$;
