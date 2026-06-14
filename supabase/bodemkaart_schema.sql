-- ─── Bodemkaart 1:50.000 (PostGIS fallback) ──────────────────────────────────
--
-- This table holds the Bodemkaart 50000 polygon dataset from BRO/PDOK.
-- It is queried as the last automatic fallback when CPT, BHR-GT and GeoTOP
-- all return no data. Because it lives in-database it is always available.
--
-- IMPORT STEPS:
-- 1. Download the GeoPackage from PDOK:
--    https://service.pdok.nl/bro/bodemkaart/atom/v1_0/
--    (search for "bodemkaart" → download GeoPackage, ~150 MB)
--
-- 2. Import with ogr2ogr (requires GDAL):
--    ogr2ogr -f PostgreSQL \
--      "PG:host=<db-host> port=5432 user=postgres password=<pw> dbname=postgres" \
--      bodemkaart.gpkg bodemkaart_vlakken \
--      -nln public.bodemkaart \
--      -nlt MULTIPOLYGON \
--      -t_srs EPSG:28992 \
--      -select "bodemcode"
--
-- 3. Run this script in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- PostGIS must be enabled (Supabase has it by default)
create extension if not exists postgis;

-- The ogr2ogr import creates the table; if running this script before the
-- import, create a placeholder so the RPC function can be defined.
create table if not exists public.bodemkaart (
  ogc_fid  bigserial primary key,
  bodemcode text,
  wkb_geometry geometry(MultiPolygon, 28992)
);

-- Spatial index — critical for fast point-in-polygon queries
create index if not exists bodemkaart_geom_idx
  on public.bodemkaart
  using gist (wkb_geometry);

-- Bodemcode index for completeness
create index if not exists bodemkaart_code_idx
  on public.bodemkaart (bodemcode);

-- Disable RLS (read-only reference data, no user rows)
alter table public.bodemkaart disable row level security;

-- ─── RPC function ─────────────────────────────────────────────────────────────
-- Called from lib/bodemkaart.ts as supabase.rpc('get_bodemkaart_at_point', ...)

create or replace function public.get_bodemkaart_at_point(rd_x float, rd_y float)
returns table (bodemcode text)
language sql
stable
security definer
as $$
  select b.bodemcode
  from public.bodemkaart b
  where ST_Contains(
    b.wkb_geometry,
    ST_SetSRID(ST_MakePoint(rd_x, rd_y), 28992)
  )
  limit 1;
$$;
