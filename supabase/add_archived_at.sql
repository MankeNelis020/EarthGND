-- Run this in Supabase SQL editor to enable soft-archive on dashboard items.
alter table public.calculations
  add column if not exists archived_at timestamptz;

alter table public.inspection_reports
  add column if not exists archived_at timestamptz;
