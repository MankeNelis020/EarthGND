-- Bodemkaart RPC only — table public.bodemkaart already has data (~48k rows).
-- Run once in Supabase SQL Editor for project crsiwspukorzsjxuwfow.

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

-- Optional: reload PostgREST schema cache if RPC still 404s after ~30s
-- notify pgrst, 'reload schema';
