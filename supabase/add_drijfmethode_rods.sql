-- Migration: add drijfmethode and per-rod measurements to pendiepte_metingen
-- Run in Supabase SQL editor (or via CLI: supabase db push)

alter table public.pendiepte_metingen
  add column if not exists drijfmethode  text,          -- handslag | sds | pneumatisch | voorboren
  add column if not exists rods          jsonb not null default '[]',
  -- rods: [{ rod_number, installed_depth, achieved_ra }]
  add column if not exists aantal_pennen int;           -- denormalised count (from calculation recommendation)
