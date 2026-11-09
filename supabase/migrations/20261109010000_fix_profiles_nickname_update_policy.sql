-- Keep direct profile updates limited to nickname. Admin status/role changes
-- continue through the existing checked SECURITY DEFINER functions.
revoke update on public.profiles from anon, authenticated;
grant update (nickname) on public.profiles to authenticated;

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id or public.is_admin())
  with check ((select auth.uid()) = id or public.is_admin());
