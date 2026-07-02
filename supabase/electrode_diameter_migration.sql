-- Electrode diameter + stop reason for field measurements.
-- Run once via Supabase SQL editor.

alter table public.pendiepte_metingen
  add column if not exists elektrode_diameter_mm numeric not null default 14,
  add column if not exists stopreden text not null default 'onbekend'
    check (stopreden in ('doel_bereikt', 'vastgelopen', 'materiaal_op', 'onbekend'));

-- Existing measurements were inverted with d = 14 mm unless verified otherwise (see docs/contracts.md).
update public.pendiepte_metingen
set elektrode_diameter_mm = 14
where elektrode_diameter_mm is null;

comment on column public.pendiepte_metingen.elektrode_diameter_mm is
  'Diameter of the driven electrode in mm (not connection wire). Default 14 = 5/8" ground rod.';
comment on column public.pendiepte_metingen.stopreden is
  'Why driving stopped: doel_bereikt | vastgelopen | materiaal_op | onbekend';
