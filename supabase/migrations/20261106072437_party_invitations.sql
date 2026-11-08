-- Apply after 20261106072015_create_parties_minimal.sql only.
-- This migration sends and reads invitations; it does not accept or decline them.

create table public.party_invitations (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id),
  invitee_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status = 'pending'),
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);

create unique index party_invitations_pending_unique
  on public.party_invitations (party_id, invitee_id) where status = 'pending';
create index party_invitations_inbox_idx
  on public.party_invitations (invitee_id, created_at desc);

alter table public.party_invitations enable row level security;

create policy party_invitations_select_visible
  on public.party_invitations for select to authenticated
  using (
    public.is_approved() and (
      invitee_id = (select auth.uid())
      or exists (
        select 1 from public.parties p
        where p.id = party_id and p.leader_id = (select auth.uid())
      )
    )
  );

-- Approved members are visible only to the leader of the requested party.
create function public.search_party_invite_candidates(p_party_id uuid, p_query text)
returns table (user_id uuid, nickname text, invite_status text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_approved()
     or not exists (
       select 1 from public.parties p
       where p.id = p_party_id and p.leader_id = auth.uid()
     ) then
    raise exception 'Party leader required' using errcode = '42501';
  end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 50 then
    raise exception 'Enter a nickname to search' using errcode = '22023';
  end if;

  return query
  select pr.id, pr.nickname,
    case
      when exists (
        select 1 from public.party_members pm
        where pm.party_id = p_party_id and pm.user_id = pr.id
      ) then 'joined'::text
      when exists (
        select 1 from public.party_invitations i
        where i.party_id = p_party_id and i.invitee_id = pr.id and i.status = 'pending'
      ) then 'pending'::text
      else 'available'::text
    end
  from public.profiles pr
  where pr.status = 'approved'
    and pr.id <> auth.uid()
    and position(lower(btrim(p_query)) in lower(pr.nickname)) > 0
  order by pr.nickname, pr.id
  limit 30;
end;
$$;

-- The party row lock serializes leader checks with invitation creation.
-- The partial unique index also protects against concurrent duplicate requests.
create function public.send_party_invitation(p_party_id uuid, p_invitee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_leader_id uuid;
  v_invitation_id uuid;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  select p.leader_id into v_leader_id
  from public.parties p where p.id = p_party_id for update;
  if v_leader_id is null or v_leader_id <> v_user_id then
    raise exception 'Party leader required' using errcode = '42501';
  end if;
  if p_invitee_id is null or p_invitee_id = v_user_id then
    raise exception 'Cannot invite yourself' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles pr
    where pr.id = p_invitee_id and pr.status = 'approved'
  ) then
    raise exception 'Approved member required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.party_members pm
    where pm.party_id = p_party_id and pm.user_id = p_invitee_id
  ) then
    raise exception 'Already a party member' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.party_invitations i
    where i.party_id = p_party_id and i.invitee_id = p_invitee_id and i.status = 'pending'
  ) then
    raise exception 'Invitation already pending' using errcode = '23505';
  end if;

  insert into public.party_invitations (party_id, inviter_id, invitee_id)
  values (p_party_id, v_user_id, p_invitee_id)
  returning id into v_invitation_id;
  return v_invitation_id;
end;
$$;

-- Party details are returned only to the invitation recipient.
create function public.list_received_party_invitations()
returns table (
  id uuid, party_id uuid, party_name text, leader_name text,
  status text, created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  return query
  select i.id, i.party_id, p.name, leader.nickname, i.status, i.created_at
  from public.party_invitations i
  join public.parties p on p.id = i.party_id
  join public.profiles leader on leader.id = p.leader_id
  where i.invitee_id = auth.uid()
  order by i.created_at desc
  limit 100;
end;
$$;

revoke all on public.party_invitations from public, anon, authenticated;
grant select on public.party_invitations to authenticated;
revoke execute on function public.search_party_invite_candidates(uuid, text) from public, anon;
revoke execute on function public.send_party_invitation(uuid, uuid) from public, anon;
revoke execute on function public.list_received_party_invitations() from public, anon;
grant execute on function public.search_party_invite_candidates(uuid, text) to authenticated;
grant execute on function public.send_party_invitation(uuid, uuid) to authenticated;
grant execute on function public.list_received_party_invitations() to authenticated;
