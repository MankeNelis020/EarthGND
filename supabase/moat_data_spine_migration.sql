-- Sprint 1: Moat data-spine foundation
-- Run once in Supabase SQL editor after electrode_diameter_migration.sql.
--
-- Grounded in the live schema:
--   predicted depth/Ra ← calculations.result (dimension, achievedResistance)
--   actual depth/Ra    ← pendiepte_metingen.installed_depth / achieved_ra
--   region             ← named NL lat/lon boxes (not ST_CLUSTERKMEANS)
--   empirical blend    ← calculations.result.blend_applied / empirical_source
--
-- Manual imports without calculation_id get NULL prediction errors (honest).

-- ─── 1. Accuracy + quality columns on pendiepte_metingen ─────────────────────

alter table public.pendiepte_metingen
  add column if not exists predicted_depth_m numeric,
  add column if not exists predicted_ra_ohm numeric,
  add column if not exists depth_error_m numeric,
  add column if not exists depth_error_percent numeric,
  add column if not exists ra_error_ohm numeric,
  add column if not exists ra_error_percent numeric,
  add column if not exists prediction_accuracy_category text
    check (prediction_accuracy_category is null
      or prediction_accuracy_category in ('excellent', 'good', 'acceptable', 'miss', 'unknown')),
  add column if not exists data_quality_score numeric,
  add column if not exists is_outlier boolean not null default false,
  add column if not exists blend_applied boolean,
  add column if not exists empirical_contribution_percent integer,
  add column if not exists empirical_source text,
  add column if not exists regional_cluster_id text,
  add column if not exists regional_confidence numeric,
  add column if not exists source_import_batch text,
  add column if not exists last_calculated_at timestamptz,
  add column if not exists calculation_notes text;

comment on column public.pendiepte_metingen.depth_error_m is
  'installed_depth − predicted_depth_m (positive = deeper than predicted)';
comment on column public.pendiepte_metingen.prediction_accuracy_category is
  'excellent |abs%|≤10; good ≤20; acceptable ≤35; miss >35; unknown = no prediction link';

-- ─── 2. Named NL region helper ───────────────────────────────────────────────

create or replace function public.moat_region_for_coords(p_lat double precision, p_lon double precision)
returns text
language plpgsql
immutable
as $$
begin
  if p_lat is null or p_lon is null then
    return 'onbekend';
  end if;
  -- Rough metro / landscape boxes for directeur-language (not cadastral).
  if p_lat between 52.30 and 52.45 and p_lon between 4.75 and 5.05 then
    return 'Amsterdam';
  elsif p_lat between 51.85 and 52.05 and p_lon between 4.30 and 4.65 then
    return 'Rotterdam';
  elsif p_lat between 52.00 and 52.18 and p_lon between 5.00 and 5.25 then
    return 'Utrecht';
  elsif p_lat between 52.05 and 52.45 and p_lon between 5.50 and 6.20 then
    return 'Veluwe';
  elsif p_lat between 50.70 and 51.55 and p_lon between 5.50 and 6.30 then
    return 'Limburg';
  elsif p_lat between 52.25 and 52.55 and p_lon between 4.45 and 4.75 then
    return 'Haarlem-IJmond';
  elsif p_lat between 52.00 and 52.35 and p_lon between 4.55 and 4.90 then
    return 'Haarlemmermeer';
  elsif p_lat between 52.45 and 52.70 and p_lon between 5.30 and 5.70 then
    return 'Flevoland';
  elsif p_lat between 51.90 and 52.15 and p_lon between 5.00 and 5.20 then
    return 'Amersfoort';
  elsif p_lat between 51.95 and 52.15 and p_lon between 5.00 and 5.15 then
    return 'IJsselstein';
  elsif p_lat between 52.05 and 52.20 and p_lon between 4.60 and 4.80 then
    return 'Boskoop';
  else
    return 'overig-NL';
  end if;
end;
$$;

create or replace function public.moat_soil_label(p_litho integer)
returns text
language sql
immutable
as $$
  select case p_litho
    when 1 then 'klei'
    when 2 then 'leem'
    when 3 then 'zand'
    when 4 then 'grind'
    when 5 then 'veen'
    else 'mixed'
  end;
$$;

create or replace function public.moat_accuracy_category(p_abs_pct double precision)
returns text
language sql
immutable
as $$
  select case
    when p_abs_pct is null then 'unknown'
    when p_abs_pct <= 10 then 'excellent'
    when p_abs_pct <= 20 then 'good'
    when p_abs_pct <= 35 then 'acceptable'
    else 'miss'
  end;
$$;

-- Overload for numeric callers
create or replace function public.moat_accuracy_category(p_abs_pct numeric)
returns text
language sql
immutable
as $$
  select public.moat_accuracy_category(p_abs_pct::double precision);
$$;

-- ─── 3. regional_signatures (moat materialized) ──────────────────────────────

create table if not exists public.regional_signatures (
  id uuid primary key default gen_random_uuid(),
  region_name text not null,
  soil_type text not null default 'mixed',
  region_center_lat double precision,
  region_center_lon double precision,

  measurement_count integer not null default 0,
  linked_prediction_count integer not null default 0,

  avg_prediction_error_pct numeric,
  std_prediction_error_pct numeric,
  confidence_score numeric,           -- 0–1
  empirical_percentage numeric,       -- 0–100 avg contribution when known
  first_try_success_rate numeric,     -- 0–100 (% not 'miss')

  sellable boolean not null default false,
  recommended_pricing_tier text
    check (recommended_pricing_tier in ('premium', 'standard', 'pilot', 'building')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (region_name, soil_type)
);

create index if not exists regional_signatures_confidence_idx
  on public.regional_signatures (confidence_score desc nulls last);

alter table public.regional_signatures enable row level security;

-- Service role / admin API uses service key; no public policies intentionally.

comment on table public.regional_signatures is
  'Sprint 1 moat spine: per region × soil confidence / empirical blend / sell readiness.';

-- ─── 4. Refresh: backfill meting metrics from calculations ───────────────────

create or replace function public.refresh_moat_meting_metrics()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  with joined as (
    select
      m.id,
      m.installed_depth,
      m.achieved_ra,
      m.lat,
      m.lon,
      m.bro_litho_class,
      m.measurement_quality,
      m.depth_curve,
      m.stopreden,
      m.field_gw_depth,
      m.elektrode_diameter_mm,
      case
        when c.result ? 'dimension' then (c.result->>'dimension')::numeric
        when c.result ? 'depth' then (c.result->>'depth')::numeric
        else null
      end as pred_depth,
      case
        when c.result ? 'achievedResistance' then (c.result->>'achievedResistance')::numeric
        else null
      end as pred_ra,
      coalesce((c.result->>'blend_applied')::boolean, false) as blend,
      case
        when (c.result->>'blend_applied')::boolean is true then
          greatest(0, least(100, round(coalesce((c.result->>'empirical_confidence')::numeric, 0.1) * 100)))::integer
        when c.result->>'empirical_source' is not null
          and c.result->>'empirical_source' <> 'l1_literature' then 10
        else 0
      end as emp_pct,
      c.result->>'empirical_source' as emp_source,
      m.external_import_id
    from public.pendiepte_metingen m
    left join public.calculations c on c.id = m.calculation_id
    where m.status = 'confirmed'
       or m.installed_depth is not null
  ),
  scored as (
    select
      j.*,
      case when j.pred_depth is not null and j.installed_depth is not null
        then j.installed_depth - j.pred_depth end as depth_err,
      case when j.pred_depth is not null and j.installed_depth is not null and j.pred_depth <> 0
        then ((j.installed_depth - j.pred_depth) / j.pred_depth) * 100 end as depth_err_pct,
      case when j.pred_ra is not null and j.achieved_ra is not null
        then j.achieved_ra - j.pred_ra end as ra_err,
      case when j.pred_ra is not null and j.achieved_ra is not null and j.pred_ra <> 0
        then ((j.achieved_ra - j.pred_ra) / j.pred_ra) * 100 end as ra_err_pct,
      public.moat_region_for_coords(j.lat, j.lon) as region_id,
      -- Completeness 0–1
      (
        (case when j.installed_depth is not null then 0.25 else 0 end) +
        (case when j.achieved_ra is not null then 0.25 else 0 end) +
        (case when j.depth_curve is not null and jsonb_array_length(coalesce(j.depth_curve, '[]'::jsonb)) > 0 then 0.2 else 0 end) +
        (case when j.lat is not null and j.lon is not null then 0.15 else 0 end) +
        (case when j.pred_depth is not null then 0.15 else 0 end)
      ) as quality
    from joined j
  )
  update public.pendiepte_metingen m
  set
    predicted_depth_m              = s.pred_depth,
    predicted_ra_ohm               = s.pred_ra,
    depth_error_m                  = s.depth_err,
    depth_error_percent            = round(s.depth_err_pct::numeric, 2),
    ra_error_ohm                   = s.ra_err,
    ra_error_percent               = round(s.ra_err_pct::numeric, 2),
    prediction_accuracy_category   = public.moat_accuracy_category(abs(s.depth_err_pct)::double precision),
    data_quality_score             = round(s.quality::numeric, 3),
    blend_applied                  = s.blend,
    empirical_contribution_percent = s.emp_pct,
    empirical_source               = s.emp_source,
    regional_cluster_id            = s.region_id,
    source_import_batch            = coalesce(m.source_import_batch, s.external_import_id),
    last_calculated_at             = now(),
    calculation_notes              = case
      when s.pred_depth is null then 'Geen gekoppelde prediction (calculation_id ontbreekt of result leeg)'
      when s.stopreden = 'vastgelopen' then 'Stopreden=vastgelopen — dieptefout kan materieel-limiet zijn, niet model'
      when s.stopreden = 'materiaal_op' then 'Stopreden=materiaal_op — dieptefout kan materieel-limiet zijn'
      else null
    end
  from scored s
  where m.id = s.id;

  get diagnostics v_updated = row_count;

  -- Outlier flag: |depth_error_percent| > 3σ within region (when n≥5)
  with stats as (
    select
      regional_cluster_id,
      avg(abs(depth_error_percent)) as mu,
      coalesce(stddev_pop(abs(depth_error_percent)), 0) as sigma
    from public.pendiepte_metingen
    where depth_error_percent is not null
      and regional_cluster_id is not null
    group by regional_cluster_id
    having count(*) >= 5
  )
  update public.pendiepte_metingen m
  set is_outlier = (
    abs(m.depth_error_percent) > (s.mu + 3 * nullif(s.sigma, 0))
  )
  from stats s
  where m.regional_cluster_id = s.regional_cluster_id
    and m.depth_error_percent is not null;

  return v_updated;
end;
$$;

-- ─── 5. Refresh regional_signatures ──────────────────────────────────────────

create or replace function public.refresh_regional_signatures()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.refresh_moat_meting_metrics();

  with base as (
    select
      coalesce(m.regional_cluster_id, public.moat_region_for_coords(m.lat, m.lon)) as region_name,
      public.moat_soil_label(m.bro_litho_class) as soil_type,
      m.lat,
      m.lon,
      m.depth_error_percent,
      m.prediction_accuracy_category,
      m.empirical_contribution_percent,
      m.installed_depth,
      m.predicted_depth_m
    from public.pendiepte_metingen m
    where m.status = 'confirmed'
       or m.installed_depth is not null
  ),
  agg as (
    select
      region_name,
      soil_type,
      count(*)::integer as measurement_count,
      count(*) filter (where predicted_depth_m is not null)::integer as linked_prediction_count,
      avg(abs(depth_error_percent)) filter (where depth_error_percent is not null) as avg_err,
      stddev_pop(abs(depth_error_percent)) filter (where depth_error_percent is not null) as std_err,
      avg(empirical_contribution_percent) filter (where empirical_contribution_percent is not null) as emp_pct,
      100.0 * count(*) filter (
        where prediction_accuracy_category is not null
          and prediction_accuracy_category <> 'miss'
          and prediction_accuracy_category <> 'unknown'
      ) / nullif(count(*) filter (
        where prediction_accuracy_category is not null
          and prediction_accuracy_category <> 'unknown'
      ), 0) as success_rate,
      avg(lat) as center_lat,
      avg(lon) as center_lon
    from base
    group by region_name, soil_type
  ),
  scored as (
    select
      a.*,
      -- confidence: sample size toward 20 × tightness of errors
      least(
        1.0,
        (least(a.measurement_count, 20)::numeric / 20.0)
        * (1.0 / (1.0 + coalesce(a.std_err, 50) / 100.0))
        * (case when a.linked_prediction_count = 0 then 0.35 else 1.0 end)
      ) as confidence_score
    from agg a
  )
  insert into public.regional_signatures as rs (
    region_name, soil_type, region_center_lat, region_center_lon,
    measurement_count, linked_prediction_count,
    avg_prediction_error_pct, std_prediction_error_pct,
    confidence_score, empirical_percentage, first_try_success_rate,
    sellable, recommended_pricing_tier, updated_at
  )
  select
    region_name,
    soil_type,
    center_lat,
    center_lon,
    measurement_count,
    linked_prediction_count,
    round(avg_err::numeric, 2),
    round(std_err::numeric, 2),
    round(confidence_score::numeric, 3),
    round(emp_pct::numeric, 1),
    round(success_rate::numeric, 1),
    confidence_score >= 0.70,
    case
      when confidence_score >= 0.85 then 'premium'
      when confidence_score >= 0.70 then 'standard'
      when confidence_score >= 0.50 then 'pilot'
      else 'building'
    end,
    now()
  from scored
  on conflict (region_name, soil_type) do update set
    region_center_lat          = excluded.region_center_lat,
    region_center_lon          = excluded.region_center_lon,
    measurement_count          = excluded.measurement_count,
    linked_prediction_count    = excluded.linked_prediction_count,
    avg_prediction_error_pct   = excluded.avg_prediction_error_pct,
    std_prediction_error_pct   = excluded.std_prediction_error_pct,
    confidence_score           = excluded.confidence_score,
    empirical_percentage       = excluded.empirical_percentage,
    first_try_success_rate     = excluded.first_try_success_rate,
    sellable                   = excluded.sellable,
    recommended_pricing_tier   = excluded.recommended_pricing_tier,
    updated_at                 = now();

  -- Sync regional_confidence onto metingen
  update public.pendiepte_metingen m
  set regional_confidence = rs.confidence_score
  from public.regional_signatures rs
  where m.regional_cluster_id = rs.region_name
    and public.moat_soil_label(m.bro_litho_class) = rs.soil_type;

  select count(*) into v_count from public.regional_signatures;
  return v_count;
end;
$$;

-- ─── 6. Dashboard queries as RPCs ────────────────────────────────────────────

create or replace function public.calculate_moat_index()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sig as (
    select * from public.regional_signatures where measurement_count > 0
  ),
  totals as (
    select
      (select count(*) from public.pendiepte_metingen
        where status = 'confirmed' or installed_depth is not null) as total_measurements,
      (select count(distinct date_trunc('month', coalesce(confirmed_at, submitted_at, created_at)))
         from public.pendiepte_metingen
        where status = 'confirmed' or installed_depth is not null) as active_months,
      coalesce(avg(confidence_score), 0) as avg_confidence,
      coalesce(stddev_pop(confidence_score), 0) as confidence_spread,
      coalesce(avg(empirical_percentage), 0) as avg_empirical,
      count(*) filter (where confidence_score >= 0.70) as strong_regions,
      count(*) as region_count
    from sig
  )
  select jsonb_build_object(
    'total_measurements', total_measurements,
    'active_months', active_months,
    'avg_confidence', round(avg_confidence::numeric, 3),
    'confidence_spread', round(confidence_spread::numeric, 3),
    'avg_empirical_percentage', round(avg_empirical::numeric, 1),
    'strong_regions', strong_regions,
    'region_count', region_count,
    'volume_component', round(least(1.0, total_measurements / 500.0)::numeric, 3),
    'confidence_component', round(avg_confidence::numeric, 3),
    'empirical_component', round(least(1.0, avg_empirical / 100.0)::numeric, 3),
    'moat_index_0_to_10', round((
      least(1.0, total_measurements / 500.0) * 0.4
      + avg_confidence * 0.4
      + least(1.0, avg_empirical / 100.0) * 0.2
    ) * 10, 2),
    'target_measurements', 500,
    'refreshed_at', now()
  )
  from totals;
$$;

create or replace function public.moat_geographic_strength()
returns table (
  region_name text,
  soil_type text,
  measurement_count integer,
  linked_prediction_count integer,
  confidence_score numeric,
  avg_prediction_error_pct numeric,
  empirical_percentage numeric,
  first_try_success_rate numeric,
  readiness_status text,
  pricing_tier text,
  sellable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rs.region_name,
    rs.soil_type,
    rs.measurement_count,
    rs.linked_prediction_count,
    rs.confidence_score,
    rs.avg_prediction_error_pct,
    rs.empirical_percentage,
    rs.first_try_success_rate,
    case
      when rs.confidence_score >= 0.85 then 'Sell with confidence'
      when rs.confidence_score >= 0.70 then 'Sell with caveats'
      when rs.confidence_score >= 0.50 then 'Building'
      else 'Not ready'
    end as readiness_status,
    rs.recommended_pricing_tier as pricing_tier,
    rs.sellable
  from public.regional_signatures rs
  order by rs.confidence_score desc nulls last, rs.measurement_count desc;
$$;

create or replace function public.moat_growth_trajectory()
returns table (
  month timestamptz,
  measurements_this_month bigint,
  cumulative_total bigint,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  with monthly as (
    select
      date_trunc('month', coalesce(confirmed_at, submitted_at, created_at)) as month,
      count(*)::bigint as measurements_this_month
    from public.pendiepte_metingen
    where status = 'confirmed' or installed_depth is not null
    group by 1
  ),
  cum as (
    select
      month,
      measurements_this_month,
      sum(measurements_this_month) over (order by month) as cumulative_total
    from monthly
  )
  select
    month,
    measurements_this_month,
    cumulative_total,
    case
      when cumulative_total >= 500 then 'Target reached'
      when measurements_this_month >= 6 then 'On track'
      when measurements_this_month >= 3 then 'Slow'
      else 'Behind'
    end as status
  from cum
  order by month desc;
$$;

-- ─── 7. Initial populate ─────────────────────────────────────────────────────

select public.refresh_regional_signatures();
