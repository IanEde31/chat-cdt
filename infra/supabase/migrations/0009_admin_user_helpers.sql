-- 0009_admin_user_helpers.sql
-- Admin user-management screen support.
--
-- Reuses the EXISTING role system (public.user_roles + public.has_role +
-- enum app_role). No new admin table. Admin = has_role(auth.uid(), 'admin').
--
-- Two additive SECURITY DEFINER helpers, both prefixed chat_ per project
-- convention. Neither alters any n8n/cobrança object.
--
--   chat_is_admin()         -> boolean, used to gate the page + the nav link.
--   chat_admin_list_users() -> one row per auth user with email (from
--                              auth.users, not exposed via PostgREST), profile,
--                              admin flag and the unit_ids it can see. Gated:
--                              non-admins get ZERO rows (the WHERE short-circuits).
--
-- Note the two different FKs this screen has to juggle:
--   user_roles.user_id  -> auth.users.id   (admin/role grants)
--   user_units.user_id  -> profiles.id     (unit visibility)

-- --------------------------------------------------------------------------
-- chat_is_admin(): is the current session an admin?
-- --------------------------------------------------------------------------
create or replace function public.chat_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.has_role(auth.uid(), 'admin'::app_role);
$$;

grant execute on function public.chat_is_admin() to authenticated;

-- --------------------------------------------------------------------------
-- chat_admin_list_users(): admin-only roster for the management screen.
-- Returns empty for non-admins (defense in depth alongside the server gate).
-- --------------------------------------------------------------------------
create or replace function public.chat_admin_list_users()
returns table (
  auth_id    uuid,
  profile_id uuid,
  email      text,
  name       text,
  is_active  boolean,
  is_admin   boolean,
  unit_ids   uuid[]
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
    )                                                 as unit_ids
  from auth.users u
  left join public.profiles p   on p.user_id = u.id
  left join public.user_units uu on uu.user_id = p.id
  where public.has_role(auth.uid(), 'admin'::app_role)
  group by u.id, p.id, u.email, p.name, p.is_active
  order by u.email;
$$;

grant execute on function public.chat_admin_list_users() to authenticated;
