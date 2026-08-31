-- Evidence & Calibration Lab — validation + activation policy
-- Safe additive schema. Does not alter production calculation paths.
-- Apply after soil_knowledge_schema.sql

-- ─── GeoTOP independent validation rows ──────────────────────────────────────

create table if not exists public.geotop_validation (
  id              uuid primary key default gen_random_uuid(),
  meting_id       uuid not null,
  electrode_no    integer not null default 0,
  lat             double precision not null,
  lon             double precision not null,
  site_cluster_id text not null,
  depth_m         double precision not null,
  measured_ra_ohm double precision not null,
  empirical_rho_ohm_m double precision not null,
  geotop_raw_lithology text not null,
  geotop_klas     integer,
  geotop_probability double precision,
  earthgnd_litho_class integer not null,
  earthgnd_class_dist jsonb not null default '{}'::jsonb,
  theoretical_mu  double precision not null,
  theoretical_sigma double precision not null,
  absolute_error  double precision not null,
  relative_error_pct double precision,
  agreement_score double precision not null,
  source_version  text not null,
  exclusion_reason text,
  created_at      timestamptz not null default now(),
  -- Idempotent natural key for backfill
  unique (meting_id, electrode_no, depth_m, source_version)
);

create index if not exists geotop_validation_meting
  on public.geotop_validation(meting_id);
create index if not exists geotop_validation_site
  on public.geotop_validation(site_cluster_id);
create index if not exists geotop_validation_litho
  on public.geotop_validation(earthgnd_litho_class);

comment on table public.geotop_validation is
  'Independent GeoTOP validation — lithology never inferred from rho. Lab / Poort 3 support.';

-- ─── Per-lithology empirical weight policy (Poort 4) ─────────────────────────

create table if not exists public.empirical_weight_policy (
  litho_class integer primary key check (litho_class between 1 and 5),
  mode text not null default 'shadow'
    check (mode in ('shadow', 'auto', 'capped_auto', 'manual')),
  empirical_cap_percent numeric not null default 30
    check (empirical_cap_percent >= 0 and empirical_cap_percent <= 100),
  manual_empirical_percent numeric not null default 0
    check (manual_empirical_percent >= 0 and manual_empirical_percent <= 100),
  min_soft_n numeric not null default 5,
  min_unique_sites integer not null default 3,
  min_agreement_score numeric not null default 0.55,
  poort3_required boolean not null default true,
  enabled boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  reason text,
  updated_at timestamptz not null default now()
);

insert into public.empirical_weight_policy (litho_class)
values (1), (2), (3), (4), (5)
on conflict (litho_class) do nothing;

-- Grind always starts blocked/disabled
update public.empirical_weight_policy
set enabled = false, mode = 'shadow', reason = 'LEARNING BLOCKED — grind default'
where litho_class = 4;

comment on table public.empirical_weight_policy is
  'Poort 4 controlled activation policy. Defaults shadow/disabled. Never auto-approves production.';

-- ─── Audit log for policy / activation wizard ────────────────────────────────

create table if not exists public.evidence_lab_audit (
  id           uuid primary key default gen_random_uuid(),
  action       text not null,
  actor_email  text,
  litho_class  integer,
  previous_state jsonb,
  new_state    jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);

create index if not exists evidence_lab_audit_created
  on public.evidence_lab_audit(created_at desc);

comment on table public.evidence_lab_audit is
  'Who/when/why for Evidence Lab policy changes. No silent production flips.';

-- ─── Job run log ─────────────────────────────────────────────────────────────

create table if not exists public.evidence_lab_jobs (
  id           uuid primary key default gen_random_uuid(),
  job_type     text not null,
  status       text not null default 'queued',
  dry_run      boolean not null default true,
  summary      jsonb,
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- RLS: service role / admin APIs only
alter table public.geotop_validation enable row level security;
alter table public.empirical_weight_policy enable row level security;
alter table public.evidence_lab_audit enable row level security;
alter table public.evidence_lab_jobs enable row level security;
