-- ─── Opleverrapport module (NEN 1010 deel 6) ────────────────────────────────
-- Run this in the Supabase SQL editor after the base schema.sql

-- ─── Projects ─────────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade not null,
  naam            text not null,
  adres           text,
  postcode        text,
  calculation_id  uuid references public.calculations(id) on delete set null,
  created_at      timestamptz default now()
);

alter table public.projects enable row level security;
create policy "Users can manage own projects"
  on public.projects for all using (auth.uid() = user_id);

-- ─── Inspection Reports ───────────────────────────────────────────────────────

create table if not exists public.inspection_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade not null,
  project_id      uuid references public.projects(id) on delete cascade,
  calculation_id  uuid references public.calculations(id) on delete set null,

  -- Status & versioning
  status          text not null default 'concept' check (status in ('concept', 'ondertekend')),
  versie          integer not null default 1,

  -- Deel 1: Algemene gegevens
  opdrachtgever         text,
  locatie               text,
  soort_installatie     text,
  aard_werkzaamheden    text check (aard_werkzaamheden in ('nieuw', 'wijziging', 'uitbreiding')),
  systeemtype           text check (systeemtype in ('TT', 'TN-S', 'TN-C-S', 'IT')),
  elektrode_type        text,
  elektrode_materiaal   text,
  elektrode_diepte_m    float,
  elektrode_aantal      integer default 1,
  uitvoerder_naam       text,
  uitvoerder_erkenning  text,
  datum_uitvoering      date,

  -- Scan context (read-only kopie bij aanmaken)
  scan_context    jsonb default '{}',

  -- Deel 3: Bevindingen & conclusie
  bevindingen     jsonb default '[]',
  eindconclusie   text,

  -- Conformiteitsverklaring (door installateur)
  conformiteit_akkoord    boolean default false,
  conformiteit_naam       text,
  conformiteit_erkenning  text,
  conformiteit_datum      timestamptz,

  -- Automatisch delen
  deel_akkoord          boolean default false,
  deel_pdf              boolean default true,
  deel_json             boolean default false,
  deel_ontvanger_naam   text,
  deel_ontvanger_email  text,
  deel_status           text,
  deel_verzonden_op     timestamptz,
  deel_error            text,

  -- AVG-grondslagen
  consent_delen        boolean default false,
  consent_kalibratie   boolean default false,

  -- Audit trail (append-only JSON array)
  audit_trail     jsonb default '[]',

  pdf_url         text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.inspection_reports enable row level security;

create policy "Users can manage own reports"
  on public.inspection_reports for all using (auth.uid() = user_id);

-- Vergrendel ondertekend rapport: alleen lezen, nooit meer wijzigen via RLS
-- (de API enforceert dit, maar dit is een extra veiligheidslaag)
create policy "Signed reports are read-only"
  on public.inspection_reports for update
  using (auth.uid() = user_id and status = 'concept');

-- ─── Metingen ─────────────────────────────────────────────────────────────────

create table if not exists public.metingen (
  id          uuid primary key default gen_random_uuid(),
  rapport_id  uuid references public.inspection_reports(id) on delete cascade not null,
  type        text not null,
  waarde      float,
  eenheid     text,
  meetmethode text,
  toetswaarde float,
  pass_fail   text check (pass_fail in ('pass', 'fail', 'nvt')),
  notities    text,
  volgorde    integer default 0,
  created_at  timestamptz default now()
);

alter table public.metingen enable row level security;
create policy "Users can manage own metingen"
  on public.metingen for all
  using (
    rapport_id in (
      select id from public.inspection_reports where user_id = auth.uid()
    )
  );

-- ─── Foto's ───────────────────────────────────────────────────────────────────

create table if not exists public.rapport_fotos (
  id          uuid primary key default gen_random_uuid(),
  rapport_id  uuid references public.inspection_reports(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  storage_path text not null,
  signed_url  text,
  label       text,
  created_at  timestamptz default now()
);

alter table public.rapport_fotos enable row level security;
create policy "Users can manage own fotos"
  on public.rapport_fotos for all using (auth.uid() = user_id);

-- ─── Kalibratie Records (geanonimiseerd, los van persoonsgegeven) ─────────────

create table if not exists public.kalibratie_records (
  id uuid primary key default gen_random_uuid(),

  -- Voorspelling (uit scan)
  voorspeld_diepte_m    float,
  voorspeld_ra_ohm      float,
  rho_voorspeld         float,

  -- Gemeten werkelijkheid
  gemeten_diepte_m      float,
  gemeten_ra_ohm        float,
  elektrode_type        text,
  elektrode_aantal      integer,

  -- Geanonimiseerde locatiecontext
  postcode_4cijfers     text,
  litho_klasse          integer,
  grondwaterstand_m     float,
  systeemtype           text,

  -- Metadata
  consent_gegeven       boolean default false,
  created_at            timestamptz default now()
);

-- Kalibratie is append-only; geen RLS nodig (geen persoonsgegeven)
-- Alleen service-role mag schrijven (vanuit API-route met service key)

-- ─── Storage bucket voor foto's ───────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('rapport-fotos', 'rapport-fotos', false)
on conflict (id) do nothing;

create policy "Users can upload rapport fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rapport-fotos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own rapport fotos"
  on storage.objects for select to authenticated
  using (bucket_id = 'rapport-fotos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ─── Updated_at trigger ────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger inspection_reports_updated_at
  before update on public.inspection_reports
  for each row execute function public.set_updated_at();
