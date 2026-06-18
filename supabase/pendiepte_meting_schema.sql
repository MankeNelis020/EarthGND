-- ─── Pendiepte veldmeting — koppeling berekening ↔ monteur ─────────────────
-- Voer uit in Supabase SQL editor (of via CLI: supabase db push)

-- 1. Extra kolommen op de berekening
alter table public.calculations
  add column if not exists monteur_email text,
  add column if not exists monteur_invited_at timestamptz,
  -- Vrije naam voor het opleverrapport (ingesteld zodra een CTA wordt gebruikt)
  add column if not exists rapport_naam text;

-- TODO (gevroren): KLIC-melding integratie in Pendiepte Calculator
--   Idee: vanuit de calculator een KLIC-melding starten op basis van de locatie (postcode/GPS).
--   Afhankelijk van KLIC/Kadaster API beschikbaarheid en authenticatieflow.

-- 2. Veldmeting tabel
create table if not exists public.pendiepte_metingen (
  id                uuid primary key default gen_random_uuid(),
  calculation_id    uuid references public.calculations(id) on delete cascade,
  calculator_user_id uuid references public.profiles(id),
  monteur_user_id   uuid references public.profiles(id),
  monteur_email     text,

  -- Locatie (ingevuld door monteur op locatie)
  lat               float8,
  lon               float8,
  gps_accuracy_m    float4,
  postcode          text,
  straatnaam        text,
  huisnummer        text,
  woonplaats        text,

  -- Dieptecurve: [{ depth: 3, ra: 45.2 }, ...]
  depth_curve       jsonb not null default '[]',

  -- Eindmeting
  achieved_ra       float4,
  installed_depth   float4,
  electrode_type    text,
  notes             text,

  status            text not null default 'draft'
                    check (status in ('draft','invited','submitted','confirmed')),
  submitted_at      timestamptz,
  confirmed_at      timestamptz,
  created_at        timestamptz default now(),

  unique (calculation_id)
);

-- RLS
alter table public.pendiepte_metingen enable row level security;

-- Calculator-gebruiker: mag eigen metingen aanmaken en zien
create policy "Calculator mag meting aanmaken"
  on public.pendiepte_metingen for insert
  with check (auth.uid() = calculator_user_id);

create policy "Calculator ziet eigen metingen"
  on public.pendiepte_metingen for select
  using (auth.uid() = calculator_user_id);

-- Monteur: mag meting zien en bijwerken via calculation_id
create policy "Monteur ziet toegewezen meting"
  on public.pendiepte_metingen for select
  using (auth.uid() = monteur_user_id);

create policy "Monteur mag bijwerken"
  on public.pendiepte_metingen for update
  using (auth.uid() = monteur_user_id and status = 'draft');

-- Service role (API routes) mag alles
-- (service_role bypasses RLS by default in Supabase)

-- Eenvoudige index op locatie voor toekomstige proximity queries.
-- Voor echte afstandsberekeningen: enable de cube + earthdistance extensies
-- en vervang door: USING gist (ll_to_earth(lat, lon))
create index if not exists pendiepte_metingen_location
  on public.pendiepte_metingen (lat, lon)
  where status = 'confirmed' and lat is not null;
