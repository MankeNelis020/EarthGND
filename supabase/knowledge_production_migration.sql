-- Productie-migratie: veldmetingen kennisbank + dedup Google Sheets import
-- Voer uit in Supabase SQL editor NA soil_knowledge_schema.sql

alter table public.pendiepte_metingen
  add column if not exists knowledge_processed_at timestamptz,
  add column if not exists external_import_id text;

create unique index if not exists pendiepte_metingen_external_import_id
  on public.pendiepte_metingen (external_import_id)
  where external_import_id is not null;

comment on column public.pendiepte_metingen.knowledge_processed_at is
  'Timestamp van Welford-accumulatie. Voorkomt dubbeltelling bij herbevestiging.';
comment on column public.pendiepte_metingen.external_import_id is
  'Unieke sleutel uit Google Sheets (rij-ID) voor idempotente import.';
