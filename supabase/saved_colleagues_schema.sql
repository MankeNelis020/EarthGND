-- ─── Opgeslagen collega's (monteur-contacten per gebruiker) ───────────────────
-- Voer uit in Supabase SQL editor na pendiepte_meting_schema.sql

create table if not exists public.saved_colleagues (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null default '',
  email        text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, email)
);

create index if not exists saved_colleagues_user_id_idx
  on public.saved_colleagues (user_id, last_used_at desc nulls last);

alter table public.saved_colleagues enable row level security;

create policy "Users manage own colleagues"
  on public.saved_colleagues for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
