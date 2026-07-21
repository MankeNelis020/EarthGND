-- ─── Support Core Schema ─────────────────────────────────────────────────────
-- Fase 1: conversations, messages, calculation_snapshots
-- RLS: gebruikers zien alleen hun eigen data. Service-role omzeilt RLS.

-- ─── calculation_snapshots ────────────────────────────────────────────────────

create table if not exists public.calculation_snapshots (
  id             uuid primary key default gen_random_uuid(),
  calculation_id uuid not null,
  user_id        uuid not null references auth.users on delete cascade,
  payload        jsonb not null,  -- immutable: invoer, bodemlagen, bronnen, model, uitkomst, waarschuwingen, confidence
  created_at     timestamptz not null default now()
);

alter table public.calculation_snapshots enable row level security;

create policy "Users can view own calculation snapshots"
  on public.calculation_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert own calculation snapshots"
  on public.calculation_snapshots for insert
  with check (auth.uid() = user_id);

-- ─── conversations ────────────────────────────────────────────────────────────

create table if not exists public.conversations (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users on delete cascade,
  organisation_id         uuid,
  category                text not null check (category in ('calculation', 'technical', 'other')),
  status                  text not null default 'open'
                            check (status in ('open', 'waiting_for_support', 'waiting_for_customer', 'resolved', 'closed')),
  subject                 text,
  context                 jsonb not null default '{}'::jsonb,
  -- context bevat: projectId, calculationId, appVersion, currentRoute, userAgent
  calculation_snapshot_id uuid references public.calculation_snapshots(id) on delete set null,
  last_message_at         timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create index if not exists idx_conversations_user_last_message
  on public.conversations (user_id, last_message_at desc);

-- ─── messages ─────────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type     text not null check (sender_type in ('user', 'agent', 'system')),
  sender_ref      text not null,         -- pseudoniem: 'MNT-0281', 'AGENT-001', 'SYSTEM'
  body            text not null,
  attachments     jsonb not null default '[]'::jsonb,
  -- attachments: array van { storage_path, mime, size }
  external_ref    jsonb,                 -- adapter-specifiek: Slack thread_ts, channel_id, event_id
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Users can view messages in own conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in own conversations"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can update own messages (mark read)"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at);

-- ─── Trigger: conversations.last_message_at ──────────────────────────────────

create or replace function public.update_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set    last_message_at = new.created_at,
         updated_at      = new.created_at
  where  id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_update_last_message_at on public.messages;

create trigger trg_update_last_message_at
  after insert on public.messages
  for each row
  execute function public.update_conversation_last_message_at();

-- ─── Rate-limiting helper ─────────────────────────────────────────────────────
-- Wordt aangeroepen vanuit de service-laag. Geeft true terug als de gebruiker
-- het limiet (10 per uur) nog niet bereikt heeft.

create or replace function public.support_rate_limit_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 10
  from   public.conversations
  where  user_id    = p_user_id
    and  created_at > now() - interval '1 hour';
$$;
