-- Split subscription credits from purchased (loose) credits.
-- Run once via Supabase SQL editor after credits_functions.sql is updated.

alter table public.profiles
  add column if not exists credits_purchased integer not null default 0;

-- Backfill: treat anything above the plan quota as purchased credits.
update public.profiles
set credits_purchased = case
  when plan = 'gratis'  then credits_left
  when plan = 'starter' then greatest(0, credits_left - 10)
  when plan = 'basic'   then greatest(0, credits_left - 50)
  when plan = 'pro'     then greatest(0, credits_left - 150)
  else 0
end;
