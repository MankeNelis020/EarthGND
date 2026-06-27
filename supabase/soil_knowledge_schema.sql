-- ─── Soil Knowledge Store — schema ────────────────────────────────────────────
-- Fase -1 implementatie: hiërarchische kennisarchitectuur
--   Layer 2: soil_evidence (afgeleide bodembewijs per meting)
--   Layer 2: global_prior (Welford accumulatie per lithoClass)
--   Layer 3: regional_prior (Welford accumulatie per 5×5 km RD-gridcel × lithoClass)
--   Shadow:  shadow_predictions (theorie vs. empirie logging)
--
-- Voer uit NA pendiepte_meting_schema.sql:
--   supabase db push  of  paste in SQL editor
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── Uitbreiding pendiepte_metingen ──────────────────────────────────────────

alter table public.pendiepte_metingen
  add column if not exists source_type text not null default 'monteur_app'
    check (source_type in ('monteur_app', 'manual_import', 'csv_import', 'admin_form')),
  add column if not exists measurement_quality text not null default 'goed'
    check (measurement_quality in ('goed', 'twijfelachtig', 'onbruikbaar')),
  add column if not exists electrode_count    int,
  add column if not exists bro_litho_class    int,
  add column if not exists bro_rho_wet        float4,
  add column if not exists bro_gw_depth       float4,
  add column if not exists bro_boring_afstand float4,
  add column if not exists field_gw_depth     float4,
  add column if not exists version_tag        text;

comment on column public.pendiepte_metingen.source_type is
  'Herkomst meting: monteur_app | manual_import | csv_import | admin_form';
comment on column public.pendiepte_metingen.measurement_quality is
  'Kwaliteitsoordeel. onbruikbaar = niet verwerken in kennisbank.';
comment on column public.pendiepte_metingen.bro_litho_class is
  'Snapshot BRO lithoClass ten tijde van de meting (voor anti-circulariteitscheck).';
comment on column public.pendiepte_metingen.field_gw_depth is
  'Grondwaterstand ter plaatse (oogmeting monteur). Heeft voorrang boven bro_gw_depth.';

-- Beleidsindex bevestigde metingen per locatie (voor matching engine later)
create index if not exists pendiepte_metingen_confirmed_location
  on public.pendiepte_metingen (lat, lon)
  where status = 'confirmed' and measurement_quality != 'onbruikbaar' and lat is not null;

-- ─── Layer 2 — soil_evidence ─────────────────────────────────────────────────
-- Afgeleide ρ_apparent en klasse-kansverdeling per dieptepunt per meting.
-- Eén rij per (meting_id, depth_m). Vervangen bij herverwerking.

create table if not exists public.soil_evidence (
  id                   uuid primary key default gen_random_uuid(),
  meting_id            uuid references public.pendiepte_metingen(id) on delete cascade not null,
  depth_m              float4 not null,
  rho_apparent         float4 not null,
  zone                 text not null check (zone in ('dry', 'wet')),
  derivation_method    text not null default 'dwight_no_minus1',

  -- Clasverdeling — proportionele bijdrage, soms samen = 1 (normalisatie kan licht afwijken)
  p_klei               float4 not null check (p_klei >= 0),
  p_leem               float4 not null check (p_leem >= 0),
  p_zand               float4 not null check (p_zand >= 0),
  p_grind              float4 not null check (p_grind >= 0),
  p_veen               float4 not null check (p_veen >= 0),

  -- BRO-context snapshot (voor anti-circulariteitscheck)
  bro_litho_class      int,
  bro_rho_wet          float4,
  consistency_ratio    float4,          -- rho_apparent / bro_rho_wet; null als bro onbekend
  flagged_inconsistent bool not null default false,  -- true als ratio > 3× of < 0.3×

  computed_at          timestamptz not null default now(),

  unique (meting_id, depth_m)
);

create index if not exists soil_evidence_meting_id on public.soil_evidence(meting_id);
create index if not exists soil_evidence_flagged
  on public.soil_evidence(flagged_inconsistent) where flagged_inconsistent = true;
create index if not exists soil_evidence_wet
  on public.soil_evidence(rho_apparent) where zone = 'wet';

comment on table public.soil_evidence is
  'Layer 2: afgeleide ρ_apparent en proportionele clasverdeling per dieptepunt. '
  'Eén rij per (meting, diepte). Bron voor accumulatie naar global_prior en regional_prior.';

-- ─── Layer 2 — global_prior ──────────────────────────────────────────────────
-- Welford online gewogen variantine-accumulatie per lithoClass.
-- Bevat tevens de bevroren literatuurprior als referentie.

create table if not exists public.global_prior (
  litho_class           int primary key,

  -- Welford gewogen online algoritme — drie kolommen genoeg
  total_weight          float8 not null default 0,   -- = soft_n (som proportionele gewichten)
  welford_mean          float8 not null default 0,   -- gewogen gemiddelde ρ_apparent (Ω·m)
  welford_m2            float8 not null default 0,   -- gewogen kwadratensom (voor σ)

  -- Literatuurprior — bevroren, nooit wijzigen na seed
  literature_mu         float4 not null,  -- centraalschatting literatuur (Ω·m)
  literature_sigma      float4 not null,  -- onzekerheid literatuur (Ω·m)
  literature_n_virtual  float4 not null,  -- virtuele steekproefomvang (klein = veld overschrijft snel)

  -- Afgeleide posterior — gemateriaiseerd na iedere Welford-update
  posterior_mu          float4,           -- null zolang total_weight < n_min
  posterior_sigma       float4,           -- null zolang onvoldoende data

  -- Grind-slot: altijd true voor lithoClass=4 totdat handmatig opgeheven
  learning_blocked      bool not null default false,

  last_updated          timestamptz not null default now()
);

-- Seed literatuurpriors (bevroren — niet aanpassen)
-- Bron: EarthGND Fase 0 veldmetingen 2026-06, NEN-EN-IEC 60364-5-54:2011 Annex B, CROW/TNO
insert into public.global_prior
  (litho_class, literature_mu, literature_sigma, literature_n_virtual, learning_blocked)
values
  (1, 10,  5,  3, false),  -- klei:  NEN Annex B 8–15 Ω·m
  (2, 20,  10, 2, false),  -- leem:  extrapolatie 2.8× factor, geen NL meting (±50%)
  (3, 45,  15, 5, false),  -- zand:  geo.mean IJmuiden ~43 + Amersfoort ~52 Ω·m (n=20)
  (4, 110, 55, 1, true),   -- grind: extrapolatie ⚠ ONVERGELIJKT — learning_blocked=true
  (5, 10,  4,  4, false)   -- veen:  CROW/TNO NL laagveen literatuur geo.mean ~10 Ω·m
on conflict (litho_class) do nothing;

comment on table public.global_prior is
  'Layer 2: globale klassekennis via Welford gewogen online variantie-accumulatie. '
  'literature_* kolommen zijn bevroren referentie. posterior_* worden bijgewerkt na iedere meting. '
  'grind (lithoClass=4) heeft learning_blocked=true — handmatig opheffen na grind-verificatie.';

-- ─── Layer 3 — regional_prior ────────────────────────────────────────────────
-- Identiek aan global_prior maar gesplitst per 5×5 km RD-gridcel × lithoClass.
-- RD-gridcoordinaten afgerond op 5000 m (rd_grid_x = round(rdX / 5000) * 5000).

create table if not exists public.regional_prior (
  id           uuid primary key default gen_random_uuid(),

  -- Regio-identifiers
  rd_grid_x    int not null,   -- RD X afgerond op 5000 m
  rd_grid_y    int not null,   -- RD Y afgerond op 5000 m
  litho_class  int not null,

  -- Welford
  total_weight float8 not null default 0,
  welford_mean float8 not null default 0,
  welford_m2   float8 not null default 0,

  -- Posterior (gemateriaiseerd)
  posterior_mu    float4,
  posterior_sigma float4,

  last_updated timestamptz not null default now(),

  unique (rd_grid_x, rd_grid_y, litho_class)
);

create index if not exists regional_prior_location
  on public.regional_prior(rd_grid_x, rd_grid_y);
create index if not exists regional_prior_class
  on public.regional_prior(litho_class);

comment on table public.regional_prior is
  'Layer 3: regionale klassekennis per 5×5 km RD-gridcel. '
  'Zelfde Welford-mechanisme als global_prior maar geografisch gedifferentieerd. '
  'Regio met te weinig data (total_weight < 5) valt terug op global_prior.';

-- ─── Shadow Predictions ───────────────────────────────────────────────────────
-- Logt per berekening de bijdrage van alle 4 niveaus en de Bayesiaanse posterior.
-- actual_rho wordt ingevuld zodra een meting voor die locatie confirmed is.
-- Dient als trainingsdata voor σ-leren (welke features bepalen nauwkeurigheid?).

create table if not exists public.shadow_predictions (
  id             uuid primary key default gen_random_uuid(),
  calculation_id uuid references public.calculations(id),

  -- Level contributions (μ, σ, n) per niveau — null als niveau geen data heeft
  l1_mu float4, l1_sigma float4, l1_n float4,  -- literatuurprior
  l2_mu float4, l2_sigma float4, l2_n float4,  -- globale klassekennis
  l3_mu float4, l3_sigma float4, l3_n float4,  -- regionale prior
  l4_mu float4, l4_sigma float4, l4_n float4,  -- lokale observaties (IDW)

  -- Bayesiaanse posterior (precisiegewogen combinatie)
  posterior_mu    float4,
  posterior_sigma float4,

  -- Features voor σ-leren (welke factoren correleren met voorspelnauwkeurigheid?)
  feat_distance_l4_m      float4,   -- afstand dichtstbijzijnde lokale observatie (m)
  feat_profile_match_l4   float4,   -- profielmatch-score (0–1) met L4 observaties
  feat_gw_delta_m         float4,   -- |gwDepth_query − gwDepth_L4| (m)
  feat_bro_source         text,     -- 'cpt' | 'bhrgt' | 'geotop' | 'bodemkaart' | 'fallback'
  feat_soft_n_l3          float4,   -- total_weight van beste regionale bucket
  feat_measurement_quality text,    -- kwaliteit van L4 observaties

  -- Ground truth (ingevuld nadat bijbehorende meting confirmed is)
  actual_rho       float4,          -- gemeten ρ_apparent op die locatie
  actual_meting_id uuid references public.pendiepte_metingen(id),
  absolute_error   float4,          -- |posterior_mu − actual_rho|
  relative_error   float4,          -- |posterior_mu − actual_rho| / actual_rho

  -- Altijd 0 in shadow mode — pas > 0 na productiepoort-beslissing
  empirical_weight float4 not null default 0,

  created_at       timestamptz not null default now()
);

create index if not exists shadow_predictions_calc
  on public.shadow_predictions(calculation_id);
create index if not exists shadow_predictions_unresolved
  on public.shadow_predictions(created_at)
  where actual_rho is null;
create index if not exists shadow_predictions_with_ground_truth
  on public.shadow_predictions(absolute_error)
  where actual_rho is not null;

comment on table public.shadow_predictions is
  'Shadow mode logging: theorie vs. empirie per berekening. '
  'actual_rho ingevuld na confirmed meting op dezelfde locatie. '
  'feat_* kolommen worden gebruikt om te leren welke factoren σ bepalen (Fase 1+). '
  'empirical_weight blijft 0 totdat productiepoort-beslissing genomen is.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Alle kennisbanktabellen: alleen service role (API) schrijft; users lezen niets direct.

alter table public.soil_evidence      enable row level security;
alter table public.global_prior       enable row level security;
alter table public.regional_prior     enable row level security;
alter table public.shadow_predictions enable row level security;
-- Service role bypasses RLS by default in Supabase — geen extra policies nodig.
