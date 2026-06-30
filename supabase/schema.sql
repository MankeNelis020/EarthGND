-- ─── Profiles ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                     uuid references auth.users on delete cascade primary key,
  email                  text,
  plan                   text not null default 'gratis',
  credits_left           integer not null default 0,
  credits_purchased      integer not null default 0,
  credits_reset          timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ─── Credit transactions ──────────────────────────────────────────────────────

create table if not exists public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  type        text not null check (type in ('subscription_reset', 'purchase', 'used')),
  credits     integer not null,
  description text,
  created_at  timestamptz default now()
);

alter table public.credit_transactions enable row level security;

create policy "Users can view own transactions"
  on public.credit_transactions for select using (auth.uid() = user_id);

-- ─── Calculations ─────────────────────────────────────────────────────────────

create table if not exists public.calculations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete cascade,
  tool           text not null check (tool in ('ohm', 'diepte')),
  postcode       text,
  input          jsonb not null default '{}',
  resultaat      jsonb not null default '{}',
  risicoklasse   text,
  credit_gebruikt boolean default false,
  pdf_url        text,
  created_at     timestamptz default now()
);

alter table public.calculations enable row level security;

create policy "Users can view own calculations"
  on public.calculations for select using (auth.uid() = user_id);

create policy "Users can insert own calculations"
  on public.calculations for insert with check (auth.uid() = user_id);

-- ─── Auto-create profile on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Migration: add new columns to existing tables ───────────────────────────
-- Run these if the tables already exist without the new columns:
--
-- alter table public.profiles
--   add column if not exists plan text not null default 'gratis',
--   add column if not exists credits_left integer not null default 0,
--   add column if not exists credits_reset timestamptz,
--   add column if not exists stripe_customer_id text,
--   add column if not exists stripe_subscription_id text;
--
-- alter table public.calculations
--   add column if not exists input jsonb not null default '{}',
--   add column if not exists resultaat jsonb not null default '{}',
--   add column if not exists risicoklasse text,
--   add column if not exists credit_gebruikt boolean default false;

-- ─── Storage bucket for PDFs ──────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload reports"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own reports"
  on storage.objects for select to authenticated
  using (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);
