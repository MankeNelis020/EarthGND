-- Voeg ontbrekende kolommen toe aan pendiepte_metingen voor de import-flow.
-- Voer uit in Supabase SQL editor.

alter table public.pendiepte_metingen
  -- Driveability (main branch)
  add column if not exists rods              jsonb not null default '[]',
  add column if not exists aantal_pennen     integer,
  add column if not exists drijfmethode      text,

  -- Import metadata
  add column if not exists measurement_quality text default 'goed'
                           check (measurement_quality in ('goed','twijfelachtig','onbruikbaar')),

  -- BRO referentiewaarden (voor vergelijking met kennisbank)
  add column if not exists bro_litho_class   integer,
  add column if not exists bro_gw_depth      float4,
  add column if not exists field_gw_depth    float4;
