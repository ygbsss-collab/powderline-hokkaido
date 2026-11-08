-- Apply after 20261108010000_set_party_active_route.sql.
-- Keep membership checks outside RLS evaluation to avoid policy recursion.

create schema if not exists party_private;
revoke all on schema party_private from public, anon;
grant usage on schema party_private to authenticated;

create function party_private.is_party_member(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.party_members pm
    where pm.party_id = p_party_id and pm.user_id = auth.uid()
  );
$$;

revoke execute on function party_private.is_party_member(uuid) from public, anon;
grant execute on function party_private.is_party_member(uuid) to authenticated;

drop policy parties_select_own on public.parties;
create policy parties_select_member on public.parties for select to authenticated
  using (public.is_approved() and party_private.is_party_member(id));

drop policy party_members_select_own on public.party_members;
create policy party_members_select_same_party on public.party_members for select to authenticated
  using (public.is_approved() and party_private.is_party_member(party_id));

-- Return only member display fields; profiles.email remains private.
create function public.list_my_party_members()
returns table (party_id uuid, user_id uuid, role text, nickname text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select pm.party_id, pm.user_id, pm.role, pr.nickname
  from public.party_members pm
  join public.profiles pr on pr.id = pm.user_id
  where exists (
    select 1 from public.party_members own
    where own.party_id = pm.party_id and own.user_id = auth.uid()
  )
  order by pm.party_id, pm.joined_at, pm.user_id;
end;
$$;

revoke execute on function public.list_my_party_members() from public, anon;
grant execute on function public.list_my_party_members() to authenticated;
