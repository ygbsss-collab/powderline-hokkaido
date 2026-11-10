-- ==========================================================================
-- POWDERLINE HOKKAIDO: Parties, Party Members, & Party Invitations
-- Safe, idempotent migration with strict RLS and Leader Permissions
-- Supports Route Sharing and Real-time GPS Location Telemetry Extensions
-- ==========================================================================

-- 1. PARTIES TABLE (원정 파티)
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  region text check (region is null or char_length(region) <= 50),
  max_members integer not null default 8 check (max_members between 2 and 30),
  status text not null default 'active' check (status in ('active', 'disbanded', 'completed')),
  active_route_id uuid references public.powderline_routes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parties_leader_idx on public.parties (leader_id);
create index if not exists parties_status_region_idx on public.parties (status, region);
create index if not exists parties_active_route_idx on public.parties (active_route_id);

alter table public.parties enable row level security;


-- 2. PARTY MEMBERS TABLE (파티 소속 멤버 및 실시간 GPS 텔레메트리 연동)
create table if not exists public.party_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  status text not null default 'joined' check (status in ('joined', 'left', 'kicked')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- GPS 연동 및 백컨트리 안전 텔레메트리 확장 컬럼
  last_latitude double precision check (last_latitude is null or (last_latitude between -90 and 90)),
  last_longitude double precision check (last_longitude is null or (last_longitude between -180 and 180)),
  last_altitude double precision,
  last_battery_pct integer check (last_battery_pct is null or (last_battery_pct between 0 and 100)),
  last_location_updated_at timestamptz,

  unique (party_id, user_id)
);

create index if not exists party_members_party_user_idx on public.party_members (party_id, user_id);
create index if not exists party_members_user_status_idx on public.party_members (user_id, status);
create index if not exists party_members_location_updated_idx on public.party_members (party_id, last_location_updated_at desc);

alter table public.party_members enable row level security;


-- 3. PARTY INVITATIONS TABLE (파티 초대 및 입장 코드)
create table if not exists public.party_invitations (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  invite_code text unique check (invite_code is null or char_length(invite_code) between 6 and 32),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'canceled')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists party_invitations_invitee_status_idx on public.party_invitations (invitee_id, status);
create index if not exists party_invitations_code_idx on public.party_invitations (invite_code);
create index if not exists party_invitations_party_idx on public.party_invitations (party_id);

alter table public.party_invitations enable row level security;


-- ==========================================================================
-- HELPER SECURITY DEFINER FUNCTIONS (Prevents recursive RLS evaluation)
-- ==========================================================================

-- Check if current user is the leader of a specific party
create or replace function public.is_party_leader(target_party_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.parties
    where id = target_party_id and leader_id = auth.uid()
  );
$$;

-- Check if current user is an active joined member of a specific party
create or replace function public.is_party_member(target_party_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.party_members
    where party_id = target_party_id
      and user_id = auth.uid()
      and status = 'joined'
  );
$$;


-- ==========================================================================
-- TRIGGERS: Auto-add leader & Precise BEFORE UPDATE Field Validation
-- ==========================================================================

-- 1) Auto-add leader to party_members on party creation
create or replace function public.handle_party_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.party_members (party_id, user_id, role, status)
  values (new.id, new.leader_id, 'leader', 'joined')
  on conflict (party_id, user_id)
  do update set role = 'leader', status = 'joined', updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_party_created on public.parties;
create trigger on_party_created
  after insert on public.parties
  for each row execute function public.handle_party_created();


-- 2) BEFORE UPDATE field-level validator & GPS auto-purge trigger
--    Guarantees OLD vs NEW comparison: standard members CANNOT mutate role, party_id, user_id, or status.
create or replace function public.validate_party_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Case A: Party leader or System Admin
  if public.is_party_leader(old.party_id) or public.is_admin() then
    -- When leader kicks or disbands, auto-purge GPS telemetry
    if new.status in ('left', 'kicked') then
      new.last_latitude := null;
      new.last_longitude := null;
      new.last_altitude := null;
      new.last_battery_pct := null;
      new.last_location_updated_at := null;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- Case B: Standard Member updating their own record
  if old.user_id = auth.uid() then
    -- Block role mutation (Self-promotion to leader prohibited)
    if new.role is distinct from old.role then
      raise exception '일반 회원은 파티 역할을 변경할 수 없습니다.';
    end if;

    -- Block party_id mutation
    if new.party_id is distinct from old.party_id then
      raise exception '파티 소속을 변경할 수 없습니다.';
    end if;

    -- Block user_id mutation
    if new.user_id is distinct from old.user_id then
      raise exception '사용자 식별자를 변경할 수 없습니다.';
    end if;

    -- Block direct status mutation (Must use leave_party() RPC to leave safely)
    if new.status is distinct from old.status then
      raise exception '파티 상태는 직접 변경할 수 없습니다. leave_party() 함수를 이용하세요.';
    end if;

    -- Block GPS update if member is not active ('joined')
    if old.status <> 'joined' then
      raise exception '탈퇴하거나 강퇴된 파티에서는 정보를 갱신할 수 없습니다.';
    end if;

    -- Allow updating GPS coordinates and telemetry
    new.updated_at := now();
    return new;
  end if;

  -- Case C: Unauthorized
  raise exception '해당 파티원 정보를 수정할 권한이 없습니다.';
end;
$$;

drop trigger if exists trg_validate_party_member_update on public.party_members;
create trigger trg_validate_party_member_update
  before update on public.party_members
  for each row execute function public.validate_party_member_update();


-- ==========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) PARTIES RLS
-- --------------------------------------------------------------------------
drop policy if exists "parties_select_policy" on public.parties;
drop policy if exists "parties_insert_policy" on public.parties;
drop policy if exists "parties_update_policy" on public.parties;
drop policy if exists "parties_delete_policy" on public.parties;

-- Approved users can view active parties, or members can view their own party
create policy "parties_select_policy"
  on public.parties for select to authenticated
  using (
    public.is_approved() and (
      status = 'active'
      or leader_id = (select auth.uid())
      or public.is_party_member(id)
      or public.is_admin()
    )
  );

-- Only approved members can create parties (must set self as leader)
create policy "parties_insert_policy"
  on public.parties for insert to authenticated
  with check (
    public.is_approved()
    and leader_id = (select auth.uid())
  );

-- Only party leader or admin can update party details/shared course/status
create policy "parties_update_policy"
  on public.parties for update to authenticated
  using (
    public.is_party_leader(id) or public.is_admin()
  )
  with check (
    public.is_party_leader(id) or public.is_admin()
  );

-- Only party leader or admin can delete/disband party
create policy "parties_delete_policy"
  on public.parties for delete to authenticated
  using (
    public.is_party_leader(id) or public.is_admin()
  );


-- --------------------------------------------------------------------------
-- 2) PARTY MEMBERS RLS
-- --------------------------------------------------------------------------
drop policy if exists "party_members_select_policy" on public.party_members;
drop policy if exists "party_members_insert_policy" on public.party_members;
drop policy if exists "party_members_update_policy" on public.party_members;
drop policy if exists "party_members_delete_policy" on public.party_members;

-- Only fellow active party members, leader, or admins can view member roster & GPS telemetry.
-- Note: A user who has left/been kicked cannot view other members' live GPS telemetry.
create policy "party_members_select_policy"
  on public.party_members for select to authenticated
  using (
    public.is_approved() and (
      -- A user can always view their own membership record
      user_id = (select auth.uid())
      -- Active party members can view other joined members of the same party
      or (public.is_party_member(party_id) and status = 'joined')
      -- Leader or Admin can view all members in the party (including left/kicked)
      or public.is_party_leader(party_id)
      or public.is_admin()
    )
  );

-- Insert member:
-- Standard users cannot insert themselves directly with arbitrary role;
-- Joining must be role = 'member' and status = 'joined'.
create policy "party_members_insert_policy"
  on public.party_members for insert to authenticated
  with check (
    public.is_approved() and (
      -- Self joining as standard member (via join flow)
      (user_id = (select auth.uid()) and role = 'member' and status = 'joined')
      -- Leader or Admin adding a member
      or public.is_party_leader(party_id)
      or public.is_admin()
    )
  );

-- Update member:
-- Layer 1: RLS filter (Only active self, party leader, or admin can pass to trigger)
-- Layer 2: validate_party_member_update trigger enforces OLD vs NEW field integrity
create policy "party_members_update_policy"
  on public.party_members for update to authenticated
  using (
    (user_id = (select auth.uid()) and status = 'joined')
    or public.is_party_leader(party_id)
    or public.is_admin()
  )
  with check (
    (user_id = (select auth.uid()) and status = 'joined')
    or public.is_party_leader(party_id)
    or public.is_admin()
  );

-- Delete member: self or leader/admin
create policy "party_members_delete_policy"
  on public.party_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_party_leader(party_id)
    or public.is_admin()
  );


-- --------------------------------------------------------------------------
-- 3) PARTY INVITATIONS RLS
-- --------------------------------------------------------------------------
drop policy if exists "party_invitations_select_policy" on public.party_invitations;
drop policy if exists "party_invitations_insert_policy" on public.party_invitations;
drop policy if exists "party_invitations_update_policy" on public.party_invitations;
drop policy if exists "party_invitations_delete_policy" on public.party_invitations;

-- Only inviter, targeted invitee, party leader, or admin can view invitations.
-- PREVENTS code-dump: General users CANNOT list/dump all invite codes.
create policy "party_invitations_select_policy"
  on public.party_invitations for select to authenticated
  using (
    public.is_approved() and (
      inviter_id = (select auth.uid())
      or invitee_id = (select auth.uid())
      or public.is_party_leader(party_id)
      or public.is_admin()
    )
  );

-- Only party leader or admin can create invitations
create policy "party_invitations_insert_policy"
  on public.party_invitations for insert to authenticated
  with check (
    public.is_approved() and (
      public.is_party_leader(party_id)
      or public.is_admin()
    )
  );

-- Direct targeted invitee can accept/decline; leader or admin can cancel
create policy "party_invitations_update_policy"
  on public.party_invitations for update to authenticated
  using (
    invitee_id = (select auth.uid())
    or public.is_party_leader(party_id)
    or public.is_admin()
  )
  with check (
    invitee_id = (select auth.uid())
    or public.is_party_leader(party_id)
    or public.is_admin()
  );

-- Leader or admin can delete/revoke invitations
create policy "party_invitations_delete_policy"
  on public.party_invitations for delete to authenticated
  using (
    public.is_party_leader(party_id)
    or public.is_admin()
  );


-- ==========================================================================
-- 4) EXTENSION: Active Route Sharing via Parties
-- (Allow party members to read a route if it is active in their party)
-- Non-conflicting: Combines via OR with existing powderline_routes policies
-- ==========================================================================
drop policy if exists "powderline_routes_select_party_shared" on public.powderline_routes;
create policy "powderline_routes_select_party_shared"
  on public.powderline_routes for select to authenticated
  using (
    public.is_approved() and exists (
      select 1 from public.parties p
      join public.party_members pm on pm.party_id = p.id
      where p.active_route_id = powderline_routes.id
        and pm.user_id = (select auth.uid())
        and pm.status = 'joined'
        and p.status = 'active'
    )
  );


-- ==========================================================================
-- 5) SECURE RPC FUNCTIONS (Atomic Concurrency Safe & Strict Authority)
-- ==========================================================================

-- 1) Validate and peek at party info by invite code without exposing all codes
create or replace function public.get_party_by_invite_code(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invite record;
  v_party record;
  v_member_count integer;
begin
  if not public.is_approved() then
    raise exception '승인된 회원만 파티 정보를 조회할 수 있습니다.';
  end if;

  select * into v_invite from public.party_invitations
  where invite_code = trim(p_invite_code)
    and status = 'pending'
    and expires_at > now();

  if v_invite is null then
    return jsonb_build_object('valid', false, 'message', '유효하지 않거나 만료된 초대 코드입니다.');
  end if;

  select * into v_party from public.parties
  where id = v_invite.party_id and status = 'active';

  if v_party is null then
    return jsonb_build_object('valid', false, 'message', '종료되었거나 존재하지 않는 파티입니다.');
  end if;

  select count(*) into v_member_count
  from public.party_members
  where party_id = v_party.id and status = 'joined';

  return jsonb_build_object(
    'valid', true,
    'party_id', v_party.id,
    'party_name', v_party.name,
    'description', v_party.description,
    'region', v_party.region,
    'max_members', v_party.max_members,
    'current_members', v_member_count,
    'is_full', (v_member_count >= v_party.max_members)
  );
end;
$$;


-- 2) Join party securely with ROW LOCK to prevent race-condition capacity overflow
create or replace function public.join_party_by_code(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_party record;
  v_member_count integer;
  v_current_user_id uuid;
begin
  v_current_user_id := auth.uid();
  if v_current_user_id is null or not public.is_approved() then
    raise exception '인증되었거나 승인된 회원만 파티에 참가할 수 있습니다.';
  end if;

  -- 1. Find valid invitation
  select * into v_invite from public.party_invitations
  where invite_code = trim(p_invite_code)
    and status = 'pending'
    and expires_at > now();

  if v_invite is null then
    raise exception '유효하지 않거나 만료된 초대 코드입니다.';
  end if;

  -- 2. Find active party WITH ROW LOCK (FOR UPDATE) to prevent race conditions
  select * into v_party from public.parties
  where id = v_invite.party_id and status = 'active'
  for update;

  if v_party is null then
    raise exception '해당 파티를 찾을 수 없거나 이미 종료/해산되었습니다.';
  end if;

  -- 3. Check capacity under row lock
  select count(*) into v_member_count
  from public.party_members
  where party_id = v_party.id and status = 'joined';

  if v_member_count >= v_party.max_members then
    raise exception '파티 정원(%명)이 초과되어 참가할 수 없습니다.', v_party.max_members;
  end if;

  -- 4. Insert or reactivate membership (always as role = member)
  insert into public.party_members (party_id, user_id, role, status, joined_at, updated_at)
  values (v_party.id, v_current_user_id, 'member', 'joined', now(), now())
  on conflict (party_id, user_id)
  do update set status = 'joined', role = 'member', updated_at = now();

  -- 5. Mark invitation accepted if it was a single-use targeted invite
  if v_invite.invitee_id is not null then
    update public.party_invitations
    set status = 'accepted', updated_at = now()
    where id = v_invite.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'party_id', v_party.id,
    'party_name', v_party.name
  );
end;
$$;


-- 3) Leave party securely and immediately purge GPS coordinates
create or replace function public.leave_party(p_party_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_is_leader boolean;
begin
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- Check if user is the leader
  select (leader_id = v_current_user_id) into v_is_leader
  from public.parties where id = p_party_id;

  if v_is_leader then
    raise exception '파티장은 탈퇴할 수 없습니다. 파티장을 위임하거나 파티를 해산해야 합니다.';
  end if;

  -- Update status to 'left' and clear GPS location immediately
  update public.party_members
  set status = 'left',
      last_latitude = null,
      last_longitude = null,
      last_altitude = null,
      last_battery_pct = null,
      last_location_updated_at = null,
      updated_at = now()
  where party_id = p_party_id and user_id = v_current_user_id;

  return jsonb_build_object('success', true);
end;
$$;


-- 4) Kick party member (Leader or Admin only) and immediately purge member GPS coordinates
create or replace function public.kick_party_member(p_party_id uuid, p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_leader boolean;
  v_is_admin boolean;
begin
  v_is_leader := public.is_party_leader(p_party_id);
  v_is_admin := public.is_admin();

  if not (v_is_leader or v_is_admin) then
    raise exception '파티장 또는 관리자만 대원을 강퇴할 수 있습니다.';
  end if;

  if p_target_user_id = auth.uid() then
    raise exception '파티장 자신을 강퇴할 수 없습니다.';
  end if;

  -- Mark kicked and clear GPS immediately
  update public.party_members
  set status = 'kicked',
      last_latitude = null,
      last_longitude = null,
      last_altitude = null,
      last_battery_pct = null,
      last_location_updated_at = null,
      updated_at = now()
  where party_id = p_party_id and user_id = p_target_user_id;

  return jsonb_build_object('success', true);
end;
$$;


-- ==========================================================================
-- PERMISSIONS & REVOCATIONS (Strict Security Hardening)
-- Revoke all default public execution rights on SECURITY DEFINER functions
-- and grant exclusively to authenticated users.
-- ==========================================================================

-- 1) Revoke default PUBLIC execution on SECURITY DEFINER functions
revoke execute on function public.is_party_leader(uuid) from public;
revoke execute on function public.is_party_member(uuid) from public;
revoke execute on function public.handle_party_created() from public;
revoke execute on function public.validate_party_member_update() from public;
revoke execute on function public.get_party_by_invite_code(text) from public;
revoke execute on function public.join_party_by_code(text) from public;
revoke execute on function public.leave_party(uuid) from public;
revoke execute on function public.kick_party_member(uuid, uuid) from public;

-- 2) Grant table permissions to authenticated role
grant select, insert, update, delete on public.parties to authenticated;
grant select, insert, update, delete on public.party_members to authenticated;
grant select, insert, update, delete on public.party_invitations to authenticated;

-- 3) Grant function execute permissions exclusively to authenticated role
grant execute on function public.is_party_leader(uuid) to authenticated;
grant execute on function public.is_party_member(uuid) to authenticated;
grant execute on function public.get_party_by_invite_code(text) to authenticated;
grant execute on function public.join_party_by_code(text) to authenticated;
grant execute on function public.leave_party(uuid) to authenticated;
grant execute on function public.kick_party_member(uuid, uuid) to authenticated;
