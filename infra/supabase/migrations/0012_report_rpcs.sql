-- 0012_report_rpcs.sql
-- Server-side aggregation for the Relatórios dashboard. Two SECURITY DEFINER
-- RPCs returning a single JSONB each, so the client does one round trip per
-- section and never pulls raw rows.
--
-- Hard rules baked in (learned the hard way):
--   * Unit scope via the profiles.id chain (NOT user_units.user_id = auth.uid()),
--     same fix as migration 0005. Optional p_unit narrows to one unit.
--   * ALL time buckets in 'America/Sao_Paulo' (UTC-3) — UTC would shift the
--     demand curve 3h and silently produce a wrong staffing peak.
--   * coalesce EVERY scalar to 0 and EVERY jsonb_agg to '[]' — the human
--     attendance sections are empty today; null would crash null.map() client-side.

-- ===========================================================================
-- Overview: volume, deflection, demand curve, by-reason, by-unit, msg split.
-- ===========================================================================
create or replace function public.chat_report_overview(
  p_from timestamptz,
  p_to   timestamptz,
  p_unit uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
with scope as (
  select uu.unit_id
  from user_units uu
  join profiles p on p.id = uu.user_id
  where p.user_id = auth.uid()
    and (p_unit is null or uu.unit_id = p_unit)
),
conv as (
  select c.*
  from conversations c
  where c.unit_id in (select unit_id from scope)
    and c.opened_at >= p_from and c.opened_at < p_to
),
prev as (
  select c.*
  from conversations c
  where c.unit_id in (select unit_id from scope)
    and c.opened_at >= p_from - (p_to - p_from) and c.opened_at < p_from
),
msg as (
  select m.* from messages m join conv on conv.id = m.conversation_id
)
select jsonb_build_object(
  'kpis', jsonb_build_object(
    'conversations', (select count(*) from conv),
    'handoffs', (select count(*) from conv where handoff_reason is not null),
    'handoff_rate', (select coalesce(round(100.0 * count(*) filter (where handoff_reason is not null) / nullif(count(*),0), 1), 0) from conv),
    'deflection_rate', (select coalesce(round(100.0 * count(*) filter (where handoff_reason is null) / nullif(count(*),0), 1), 0) from conv),
    'messages', (select count(*) from msg),
    'backlog_now', (select count(*) from conversations c
                    where c.unit_id in (select unit_id from scope)
                      and c.status = 'open' and c.routing <> 'ai'
                      and c.assigned_operator_id is null)
  ),
  'prev', jsonb_build_object(
    'conversations', (select count(*) from prev),
    'handoffs', (select count(*) from prev where handoff_reason is not null)
  ),
  'msg_split', (select jsonb_build_object(
      'customer', coalesce(count(*) filter (where direction = 'in'), 0),
      'ai', coalesce(count(*) filter (where sent_by = 'ai'), 0),
      'operator', coalesce(count(*) filter (where sent_by = 'operator'), 0)
    ) from msg),
  'by_reason', (select coalesce(jsonb_agg(jsonb_build_object('reason', handoff_reason, 'n', n) order by n desc), '[]'::jsonb)
    from (select handoff_reason, count(*) n from conv where handoff_reason is not null group by 1) t),
  'by_unit', (select coalesce(jsonb_agg(jsonb_build_object(
        'unit_id', unit_id, 'name', name, 'convs', c, 'handoffs', h, 'rate', rate) order by c desc), '[]'::jsonb)
    from (
      select conv.unit_id, u.name, count(*) c,
             count(*) filter (where handoff_reason is not null) h,
             coalesce(round(100.0 * count(*) filter (where handoff_reason is not null) / nullif(count(*),0), 1), 0) rate
      from conv join units u on u.id = conv.unit_id
      group by conv.unit_id, u.name
    ) t),
  'hour_of_day', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'n', coalesce(n,0)) order by h), '[]'::jsonb)
    from generate_series(0,23) h
    left join (
      select extract(hour from created_at at time zone 'America/Sao_Paulo')::int hh, count(*) n
      from msg where direction = 'in' group by 1
    ) x on x.hh = h),
  'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'convs', c, 'handoffs', h) order by d), '[]'::jsonb)
    from (
      select (opened_at at time zone 'America/Sao_Paulo')::date as d,
             count(*) c, count(*) filter (where handoff_reason is not null) h
      from conv group by 1
    ) t)
);
$$;

grant execute on function public.chat_report_overview(timestamptz, timestamptz, uuid) to authenticated;

-- ===========================================================================
-- Attendance: handoff funnel, SLA (time-to-assign, handle time), outcomes,
-- operator leaderboard. Mostly empty until the team starts attending — every
-- aggregate degrades to 0 / [].
-- ===========================================================================
create or replace function public.chat_report_attendance(
  p_from timestamptz,
  p_to   timestamptz,
  p_unit uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
with scope as (
  select uu.unit_id
  from user_units uu
  join profiles p on p.id = uu.user_id
  where p.user_id = auth.uid()
    and (p_unit is null or uu.unit_id = p_unit)
),
hand as (
  select c.*
  from conversations c
  where c.unit_id in (select unit_id from scope)
    and c.handoff_reason is not null
    and c.opened_at >= p_from and c.opened_at < p_to
),
closed as (select * from hand where status = 'closed')
select jsonb_build_object(
  'funnel', jsonb_build_object(
    'queued',   (select count(*) from hand),
    'assigned', (select count(*) from hand where assigned_at is not null or assigned_operator_id is not null),
    'closed',   (select count(*) from hand where status = 'closed')
  ),
  'sla', jsonb_build_object(
    'time_to_assign_sec', (select jsonb_build_object(
        'avg', coalesce(round(avg(extract(epoch from (assigned_at - queued_at)))), 0),
        'p50', coalesce(round(percentile_cont(0.5) within group (order by extract(epoch from (assigned_at - queued_at)))), 0),
        'p90', coalesce(round(percentile_cont(0.9) within group (order by extract(epoch from (assigned_at - queued_at)))), 0),
        'n', count(*)
      ) from hand where assigned_at is not null and queued_at is not null),
    'handle_time_sec', (select jsonb_build_object(
        'avg', coalesce(round(avg(extract(epoch from (closed_at - assigned_at)))), 0),
        'p50', coalesce(round(percentile_cont(0.5) within group (order by extract(epoch from (closed_at - assigned_at)))), 0),
        'n', count(*)
      ) from hand where closed_at is not null and assigned_at is not null)
  ),
  'outcomes', (select coalesce(jsonb_agg(jsonb_build_object('outcome', close_outcome, 'n', n) order by n desc), '[]'::jsonb)
    from (select close_outcome, count(*) n from closed where close_outcome is not null group by 1) t),
  'operators', (select coalesce(jsonb_agg(jsonb_build_object(
        'operator_id', operator_id, 'name', name, 'closed', closed_n, 'resolved', resolved_n,
        'resolution_rate', coalesce(round(100.0 * resolved_n / nullif(closed_n,0), 1), 0),
        'avg_handle_sec', coalesce(handle_avg, 0)
      ) order by closed_n desc), '[]'::jsonb)
    from (
      select c.closed_by as operator_id, pr.name,
             count(*) closed_n,
             count(*) filter (where c.close_outcome = 'resolvido') resolved_n,
             round(avg(extract(epoch from (c.closed_at - c.assigned_at)))) handle_avg
      from closed c left join profiles pr on pr.user_id = c.closed_by
      where c.closed_by is not null
      group by c.closed_by, pr.name
    ) t)
);
$$;

grant execute on function public.chat_report_attendance(timestamptz, timestamptz, uuid) to authenticated;
