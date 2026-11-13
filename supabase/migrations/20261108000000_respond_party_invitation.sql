-- Apply after 20261106072437_party_invitations.sql.
-- Responses and membership changes share one RPC transaction.

alter table public.party_members
  drop constraint party_members_role_check;
alter table public.party_members
  add constraint party_members_role_check check (role in ('leader', 'member'));

alter table public.party_invitations
  drop constraint party_invitations_status_check;
alter table public.party_invitations
  add constraint party_invitations_status_check check (status in ('pending', 'accepted', 'declined'));

create function public.respond_party_invitation(p_invitation_id uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_party_id uuid;
  v_invitee_id uuid;
  v_status text;
  v_max_members integer;
  v_member_count integer;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('accepted', 'declined') then
    raise exception 'Invalid invitation response' using errcode = '22023';
  end if;

  -- Read the party key first, then serialize all responses for that party.
  select i.party_id into v_party_id
  from public.party_invitations i
  where i.id = p_invitation_id and i.invitee_id = v_user_id;
  if v_party_id is null then
    raise exception 'Invitation not found' using errcode = '42501';
  end if;

  select p.max_members into v_max_members
  from public.parties p where p.id = v_party_id for update;
  if v_max_members is null then
    raise exception 'Party not found' using errcode = '22023';
  end if;

  select i.invitee_id, i.status into v_invitee_id, v_status
  from public.party_invitations i
  where i.id = p_invitation_id and i.party_id = v_party_id for update;
  if v_invitee_id is distinct from v_user_id then
    raise exception 'Invitation recipient required' using errcode = '42501';
  end if;
  if v_status is distinct from 'pending' then
    raise exception 'Invitation already handled' using errcode = '22023';
  end if;

  if p_decision = 'accepted' then
    if exists (
      select 1 from public.party_members pm
      where pm.party_id = v_party_id and pm.user_id = v_user_id
    ) then
      raise exception 'Already a party member' using errcode = '23505';
    end if;
    select count(*) into v_member_count
    from public.party_members pm where pm.party_id = v_party_id;
    if v_member_count >= v_max_members then
      raise exception 'Party is full' using errcode = '22023';
    end if;
    insert into public.party_members (party_id, user_id, role)
    values (v_party_id, v_user_id, 'member');
  end if;

  update public.party_invitations i
  set status = p_decision
  where i.id = p_invitation_id;
  return p_decision;
end;
$$;

revoke execute on function public.respond_party_invitation(uuid, text) from public, anon;
grant execute on function public.respond_party_invitation(uuid, text) to authenticated;
