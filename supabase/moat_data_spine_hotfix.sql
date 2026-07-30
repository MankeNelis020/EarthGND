-- Hotfix: abs(depth_err_pct) is float8; moat_accuracy_category must accept it.
-- Run this if moat_data_spine_migration.sql failed at refresh_regional_signatures().

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

create or replace function public.moat_accuracy_category(p_abs_pct numeric)
returns text
language sql
immutable
as $$
  select public.moat_accuracy_category(p_abs_pct::double precision);
$$;

-- Re-create refresh with explicit cast (in case CREATE OR REPLACE of the big
-- function body wasn't applied). Safe to re-run full migration instead.
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

-- Finish Sprint 1 populate
select public.refresh_regional_signatures();
