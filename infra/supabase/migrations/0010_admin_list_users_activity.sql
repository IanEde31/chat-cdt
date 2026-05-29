-- 0010_admin_list_users_activity.sql
-- Extend chat_admin_list_users() with activity/lifecycle columns for the admin
-- dashboard: last_sign_in_at, created_at and banned_until (the REAL disabled
-- signal — profiles.is_active is cosmetic, GoTrue enforces banned_until at login).
--
-- Adding columns to a RETURNS TABLE changes the return type, which bare
-- CREATE OR REPLACE cannot do — must DROP first. Safe: no RLS policy or other
-- object depends on this function (only chat_is_admin/chat_user_has_unit are
-- referenced by policies). DROP also drops the GRANT, so it is re-granted below.

drop function if exists public.chat_admin_list_users();

create function public.chat_admin_list_users()
returns table (
  auth_id          uuid,
  profile_id       uuid,
  email            text,
  name             text,
  is_active        boolean,
  is_admin         boolean,
  unit_ids         uuid[],
  last_sign_in_at  timestamptz,
  created_at       timestamptz,
  banned_until     timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    u.id                                              as auth_id,
    p.id                                              as profile_id,
    u.email::text                                     as email,
    p.name                                            as name,
    coalesce(p.is_active, true)                       as is_active,
    public.has_role(u.id, 'admin'::app_role)          as is_admin,
    coalesce(
      array_agg(uu.unit_id) filter (where uu.unit_id is not null),
      '{}'::uuid[]
    )                                                 as unit_ids,
    u.last_sign_in_at                                 as last_sign_in_at,
    u.created_at                                      as created_at,
    u.banned_until                                    as banned_until
  from auth.users u
  left join public.profiles p   on p.user_id = u.id
  left join public.user_units uu on uu.user_id = p.id
  where public.has_role(auth.uid(), 'admin'::app_role)
  group by u.id, p.id, u.email, p.name, p.is_active,
           u.last_sign_in_at, u.created_at, u.banned_until
  order by u.email;
$$;

grant execute on function public.chat_admin_list_users() to authenticated;
