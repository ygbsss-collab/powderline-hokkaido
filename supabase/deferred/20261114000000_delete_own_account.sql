-- POWDERLINE: server-side account deletion (회원탈퇴)   *** NOT APPLIED — review before `supabase db push` ***
--
-- Kept in supabase/deferred (same convention as the other unapplied migration) because it deletes data.
-- Called ONLY by the Edge Function `delete-my-account` with the service_role key, using the user id taken from the
-- verified JWT. It is not executable by anon/authenticated, so a browser can never delete anyone through it.
--
-- Everything runs in one transaction: any error (for example a foreign key from a table this migration does not know
-- about) aborts the whole function and NOTHING is deleted.
--
-- Review points (verify against the live schema before applying):
--   * Foreign keys differ between 20261106000000_create_parties_and_members (ON DELETE CASCADE) and
--     20261106072015_create_parties_minimal (no action). The explicit deletes below make both variants work.
--   * Rows of OTHER members are never deleted: the function refuses (returns a code) when
--       - the user leads a party that still has other members          -> PARTY_LEADER
--       - the user's course is the active course of someone else's party -> ROUTE_IN_USE
--       - the user is the last approved administrator                   -> LAST_ADMIN
--   * Shared catalog data (powderline_regions, ski data) has no per-user foreign key and is not touched.
--   * Tables added outside these migrations (e.g. GPS sharing columns/tables) must not reference the user without
--     cascade, otherwise the final `delete from auth.users` raises and the transaction rolls back (safe failure).

create or replace function public.delete_own_account(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if target_user is null then
    raise exception 'target_user is required';
  end if;

  -- 1) the last approved admin must stay
  if exists (select 1 from public.profiles where id = target_user and role = 'admin' and status = 'approved')
     and (select count(*) from public.profiles where role = 'admin' and status = 'approved') <= 1 then
    return jsonb_build_object('ok', false, 'code', 'LAST_ADMIN');
  end if;

  -- 2) never remove a party that other members still belong to
  if exists (
    select 1 from public.parties p
    where p.leader_id = target_user
      and exists (select 1 from public.party_members m where m.party_id = p.id and m.user_id <> target_user)
  ) then
    return jsonb_build_object('ok', false, 'code', 'PARTY_LEADER');
  end if;

  -- 3) never break another party's active course
  if exists (
    select 1 from public.parties p
    join public.powderline_routes r on r.id = p.active_route_id
    where r.user_id = target_user and p.leader_id <> target_user
  ) then
    return jsonb_build_object('ok', false, 'code', 'ROUTE_IN_USE');
  end if;

  -- own rows only
  delete from public.party_invitations where inviter_id = target_user or invitee_id = target_user;
  delete from public.party_members where user_id = target_user;
  delete from public.parties where leader_id = target_user;           -- only parties where the user is alone remain here
  delete from public.powderline_routes where user_id = target_user;   -- the user's saved courses
  delete from auth.users where id = target_user;                       -- cascades public.profiles

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_own_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_own_account(uuid) to service_role;
