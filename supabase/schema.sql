-- Profiles table (auto-created on first login)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Calculations table
create table if not exists public.calculations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  tool text not null check (tool in ('ohm', 'diepte')),
  input_values jsonb not null default '{}',
  result jsonb not null default '{}',
  postcode text,
  pdf_url text,
  created_at timestamptz default now()
);

alter table public.calculations enable row level security;

create policy "Users can view own calculations"
  on public.calculations for select
  using (auth.uid() = user_id);

create policy "Users can insert own calculations"
  on public.calculations for insert
  with check (auth.uid() = user_id);

-- Auto-create profile on signup
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

-- Storage bucket for PDFs
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload reports"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own reports"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);
