-- Sprint 2: rename readiness language (product ≠ moat claim).
-- Idempotent: replaces moat_geographic_strength + calculate_moat_index labels only.

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
      when rs.confidence_score >= 0.85 then 'Moat bewezen'
      when rs.confidence_score >= 0.70 then 'Moat ontstaat'
      when rs.confidence_score >= 0.50 then 'Outcomes verzamelen'
      else 'Te dun voor claim'
    end as readiness_status,
    rs.recommended_pricing_tier as pricing_tier,
    -- legacy column name: means "moat claim ready", NOT product availability
    rs.sellable
  from public.regional_signatures rs
  order by rs.confidence_score desc nulls last, rs.measurement_count desc;
$$;

comment on column public.regional_signatures.sellable is
  'Legacy name. True when confidence≥0.70 = moat claim ready. Product (Dwight+BRO) is always available.';

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
    'moat_claim_ready_regions', strong_regions,
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
