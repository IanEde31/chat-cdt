-- 0011_conversation_lifecycle.sql
-- Attendance lifecycle: capture WHEN (queued/assigned/closed), WHO (closed_by),
-- and the OUTCOME of each handoff, plus an append-only event log that records
-- every transition — including reassignments and the n8n-driven handoff itself,
-- with no 4th n8n adjustment needed (a trigger stamps/logs on transition).
--
-- All additive. Does NOT change the n8n routing contract (docs/04): n8n still
-- just UPDATEs routing; our triggers observe the change.

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------
do $$ begin
  create type public.chat_close_outcome as enum (
    'resolvido', 'nao_resolvido', 'fora_de_escopo', 'cliente_nao_respondeu'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_conv_event_type as enum (
    'queued', 'assigned', 'reassigned', 'returned_to_ai', 'closed'
  );
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Lifecycle columns on conversations (additive)
-- --------------------------------------------------------------------------
alter table public.conversations
  add column if not exists queued_at     timestamptz,
  add column if not exists assigned_at   timestamptz,
  add column if not exists closed_by     uuid references auth.users(id) on delete set null,
  add column if not exists close_outcome public.chat_close_outcome,
  add column if not exists close_note    text;

-- --------------------------------------------------------------------------
-- Append-only event log
-- --------------------------------------------------------------------------
create table if not exists public.chat_conversation_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  event_type      public.chat_conv_event_type not null,
  actor_id        uuid references auth.users(id) on delete set null,  -- null = IA/sistema (n8n)
  from_routing    public.chat_routing_state,
  to_routing      public.chat_routing_state,
  from_status     public.chat_conversation_status,
  to_status       public.chat_conversation_status,
  outcome         public.chat_close_outcome,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists chat_conv_events_conv_idx
  on public.chat_conversation_events (conversation_id, created_at desc);
create index if not exists chat_conv_events_created_idx
  on public.chat_conversation_events (created_at desc);
create index if not exists chat_conv_events_actor_idx
  on public.chat_conversation_events (actor_id);

alter table public.chat_conversation_events enable row level security;

-- Read scoped to the operator's units (via the conversation). Inserts happen
-- only through the SECURITY DEFINER trigger below — no user INSERT policy.
drop policy if exists chat_conv_events_select on public.chat_conversation_events;
create policy chat_conv_events_select on public.chat_conversation_events
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = chat_conversation_events.conversation_id
        and public.chat_user_has_unit(c.unit_id)
    )
  );

-- --------------------------------------------------------------------------
-- BEFORE UPDATE: stamp lifecycle timestamps on the row itself.
-- --------------------------------------------------------------------------
create or replace function public.chat_stamp_conversation_transition()
returns trigger
language plpgsql
as $$
begin
  if new.routing = 'queued'::public.chat_routing_state
     and old.routing is distinct from new.routing
     and new.queued_at is null then
    new.queued_at := now();
  end if;

  if new.assigned_operator_id is distinct from old.assigned_operator_id
     and new.assigned_operator_id is not null then
    new.assigned_at := now();
  end if;

  if new.status = 'closed'::public.chat_conversation_status
     and old.status is distinct from new.status
     and new.closed_at is null then
    new.closed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chat_stamp_transition on public.conversations;
create trigger trg_chat_stamp_transition
  before update on public.conversations
  for each row
  when (
    old.routing is distinct from new.routing
    or old.status is distinct from new.status
    or old.assigned_operator_id is distinct from new.assigned_operator_id
  )
  execute function public.chat_stamp_conversation_transition();

-- --------------------------------------------------------------------------
-- AFTER UPDATE: append one event per transition. SECURITY DEFINER so it can
-- write regardless of who made the change (operator session OR n8n service role).
-- actor_id = auth.uid() (null for n8n) — for 'closed' we prefer closed_by.
-- --------------------------------------------------------------------------
create or replace function public.chat_log_conversation_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.routing is distinct from new.routing
     and new.routing = 'queued'::public.chat_routing_state then
    insert into public.chat_conversation_events
      (conversation_id, event_type, actor_id, from_routing, to_routing)
    values (new.id, 'queued', auth.uid(), old.routing, new.routing);
  end if;

  if old.routing is distinct from new.routing
     and new.routing = 'ai'::public.chat_routing_state then
    insert into public.chat_conversation_events
      (conversation_id, event_type, actor_id, from_routing, to_routing)
    values (new.id, 'returned_to_ai', auth.uid(), old.routing, new.routing);
  end if;

  if new.assigned_operator_id is distinct from old.assigned_operator_id
     and new.assigned_operator_id is not null then
    insert into public.chat_conversation_events
      (conversation_id, event_type, actor_id, from_routing, to_routing)
    values (
      new.id,
      case when old.assigned_operator_id is null
           then 'assigned'::public.chat_conv_event_type
           else 'reassigned'::public.chat_conv_event_type end,
      auth.uid(), old.routing, new.routing
    );
  end if;

  if new.status = 'closed'::public.chat_conversation_status
     and old.status is distinct from new.status then
    insert into public.chat_conversation_events
      (conversation_id, event_type, actor_id, from_status, to_status, outcome, note)
    values (new.id, 'closed', coalesce(new.closed_by, auth.uid()),
            old.status, new.status, new.close_outcome, new.close_note);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_chat_log_transition on public.conversations;
create trigger trg_chat_log_transition
  after update on public.conversations
  for each row
  when (
    old.routing is distinct from new.routing
    or old.status is distinct from new.status
    or old.assigned_operator_id is distinct from new.assigned_operator_id
  )
  execute function public.chat_log_conversation_transition();
