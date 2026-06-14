-- ─── KLIC Meldingen (Kabel en Leiding Informatie Centrum) ─────────────────────
-- Run this in the Supabase SQL editor after opleverrapport_schema.sql

create table if not exists public.klic_meldingen (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete cascade not null,
  rapport_id            uuid references public.inspection_reports(id) on delete set null,

  -- KLIC identificatie
  meldingsnummer        text not null,
  melddatum             date,
  geldig_tot            date,

  -- Locatie
  graaf_adres           text,
  graaf_postcode        text,

  -- Netbeheerders & aangetroffen kabels/leidingen
  utiliteiten           jsonb not null default '{}',
  -- shape: { elektriciteit: bool, gas: bool, water: bool, telecom: bool,
  --          riolering: bool, warmte: bool, overig: bool }

  netbeheerders         text[] not null default '{}',
  -- e.g. ['Liander', 'Stedin', 'Waternet', 'KPN']

  diepste_kabel_m       float,   -- deepest utility in metres (relevant for rod placement)

  -- Veiligheidsoordeel
  veilig_graven         boolean default true,
  opmerkingen           text,

  -- Foto van KLIC-tekening (opgenomen ter plaatse)
  foto_path             text,    -- storage path in rapport-fotos bucket

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table public.klic_meldingen enable row level security;

create policy "Users can manage own klic_meldingen"
  on public.klic_meldingen for all using (auth.uid() = user_id);

-- Link inspection_reports to a KLIC melding
alter table public.inspection_reports
  add column if not exists klic_melding_id uuid references public.klic_meldingen(id) on delete set null;

-- Updated_at trigger
create trigger klic_meldingen_updated_at
  before update on public.klic_meldingen
  for each row execute function public.set_updated_at();
