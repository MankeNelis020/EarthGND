-- ─── PR #56 — Work preparation + KLIC readiness ─────────────────────────────
-- Tenant = profiles.id (user_id). No organization table in EarthGND yet.
-- Existing klic_meldingen (NEN evidence) is unchanged.
-- Apply after pendiepte_meting_schema.sql + profile_settings_migration.sql.

-- 1. Project-level preparation fields on calculations
alter table public.calculations
  add column if not exists planned_execution_date date,
  add column if not exists execution_date_confirmed_at timestamptz,
  add column if not exists execution_date_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists contractor_notification_status text
    not null default 'not_sent'
    check (contractor_notification_status in ('not_sent', 'sent', 'manually_confirmed')),
  add column if not exists contractor_notified_at timestamptz,
  add column if not exists contractor_notified_by uuid references public.profiles(id) on delete set null,
  add column if not exists klic_override_at timestamptz,
  add column if not exists klic_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists klic_override_reason text;

comment on column public.calculations.planned_execution_date is
  'Canonical planned field-execution date for work preparation (not KLIC-owned).';

-- 2. Profile / organisation KLIC policy
alter table public.profiles
  add column if not exists klic_readiness_check_enabled boolean not null default true,
  add column if not exists klic_check_disabled_at timestamptz,
  add column if not exists klic_check_disabled_by uuid references public.profiles(id) on delete set null,
  add column if not exists klic_check_disable_acknowledgement_version text;

-- 3. Kadaster KLIC integration (per user/org — metadata only; secrets via reference)
create table if not exists public.klic_integrations (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references public.profiles(id) on delete cascade,
  provider                      text not null default 'manual'
    check (provider in ('manual', 'kadaster_bmkl', 'dev_mock')),
  status                        text not null default 'disconnected'
    check (status in ('disconnected', 'configuration_required', 'connected', 'connection_error')),
  provider_account_reference    text,
  -- Opaque server-side reference only — never return credential material to clients
  encrypted_credentials_reference text,
  last_verified_at              timestamptz,
  last_error_code               text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (user_id)
);

alter table public.klic_integrations enable row level security;

drop policy if exists "Users manage own klic_integrations" on public.klic_integrations;
create policy "Users manage own klic_integrations"
  on public.klic_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Prep-stage KLIC requests (lifecycle; linked to calculation = project)
create table if not exists public.klic_requests (
  id                            uuid primary key default gen_random_uuid(),
  calculation_id                uuid not null references public.calculations(id) on delete cascade,
  user_id                       uuid not null references public.profiles(id) on delete cascade,
  provider                      text not null default 'manual'
    check (provider in ('manual', 'kadaster_bmkl', 'dev_mock')),
  status                        text not null default 'not_started'
    check (status in (
      'not_started', 'manual_pending', 'submitted', 'processing',
      'ready', 'attention_required', 'failed'
    )),
  external_request_id           text,
  reference_number              text,
  requested_at                  timestamptz,
  requested_by                  uuid references public.profiles(id) on delete set null,
  delivery_received_at          timestamptz,
  execution_date_at_submission  date,
  last_status_checked_at        timestamptz,
  last_error_code               text,
  last_error_message_safe       text,
  -- Geometry placeholder for future polygon selector (GeoJSON-ish jsonb)
  geometry                      jsonb,
  idempotency_key               text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (calculation_id)
);

create unique index if not exists klic_requests_idempotency_key_uidx
  on public.klic_requests (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.klic_requests enable row level security;

drop policy if exists "Users manage own klic_requests" on public.klic_requests;
create policy "Users manage own klic_requests"
  on public.klic_requests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at triggers (reuse set_updated_at if present)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at' and n.nspname = 'public'
  ) then
    drop trigger if exists klic_integrations_updated_at on public.klic_integrations;
    create trigger klic_integrations_updated_at
      before update on public.klic_integrations
      for each row execute function public.set_updated_at();

    drop trigger if exists klic_requests_updated_at on public.klic_requests;
    create trigger klic_requests_updated_at
      before update on public.klic_requests
      for each row execute function public.set_updated_at();
  end if;
end $$;
