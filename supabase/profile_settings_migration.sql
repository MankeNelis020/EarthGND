-- Profile settings: installateur gegevens, logo, account consent
-- Run in Supabase SQL editor after schema.sql

alter table public.profiles
  add column if not exists company_name           text,
  add column if not exists logo_url               text,
  add column if not exists installateur_naam      text,
  add column if not exists installateur_erkenning text,
  add column if not exists terms_accepted_at      timestamptz;

-- Optional certificaatnummer per opgeslagen collega
alter table public.saved_colleagues
  add column if not exists erkenning text;

-- Storage bucket for profile logos (Pro plan — enforced in app)
insert into storage.buckets (id, name, public)
values ('profile-logos', 'profile-logos', true)
on conflict (id) do nothing;

create policy "Users upload own profile logo"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own profile logo"
  on storage.objects for update
  using (
    bucket_id = 'profile-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Profile logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'profile-logos');

create policy "Users delete own profile logo"
  on storage.objects for delete
  using (
    bucket_id = 'profile-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
