-- ─── Ensure canonical calculations columns (safe re-run) ─────────────────────
-- Run in Supabase SQL editor if monteur/ID persist fails with schema-cache errors.
-- Keeps legacy columns until you verify all rows are backfilled.

alter table public.calculations
  add column if not exists input_values jsonb not null default '{}',
  add column if not exists result       jsonb not null default '{}';

-- Backfill canonical columns from legacy when still present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calculations' and column_name = 'input'
  ) then
    execute $sql$
      update public.calculations
      set input_values = coalesce(nullif(input_values, '{}'::jsonb), input, '{}'::jsonb)
      where input_values = '{}'::jsonb and input is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calculations' and column_name = 'resultaat'
  ) then
    execute $sql$
      update public.calculations
      set result = coalesce(nullif(result, '{}'::jsonb), resultaat, '{}'::jsonb)
      where result = '{}'::jsonb and resultaat is not null
    $sql$;
  end if;
end $$;

-- After deploy + verification, optionally drop legacy columns:
-- alter table public.calculations drop column if exists input;
-- alter table public.calculations drop column if exists resultaat;

-- Reload PostgREST schema cache: Supabase Dashboard → Settings → API → Reload schema
