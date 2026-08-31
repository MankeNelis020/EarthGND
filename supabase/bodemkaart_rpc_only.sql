-- Bodemkaart RPC — replace existing signature (params were named x/y; app expects rd_x/rd_y).
-- Run in Supabase SQL Editor for project crsiwspukorzsjxuwfow.

-- Old overloads (any prior param names)
drop function if exists public.get_bodemkaart_at_point(double precision, double precision);
drop function if exists public.get_bodemkaart_at_point(float, float);
drop function if exists public.get_bodemkaart_at_point(numeric, numeric);

create or replace function public.get_bodemkaart_at_point(rd_x float, rd_y float)
returns table (bodemcode text)
language sql
stable
security definer
as $$
  select b.bodemcode
  from public.bodemkaart b
  where ST_Contains(
    b.geom,
    ST_SetSRID(ST_MakePoint(rd_x, rd_y), 28992)
  )
  limit 1;
$$;

-- If PostgREST still caches the old signature for ~30s:
-- notify pgrst, 'reload schema';
