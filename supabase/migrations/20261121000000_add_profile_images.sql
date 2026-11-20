-- POWDERLINE: profile photo / default avatar + first-login profile setup for NEW members.
-- Verified on production in a rolled-back transaction (31 checks) before this migration.
--
-- Data (minimal, on public.profiles):
--   avatar_id                  1..8 = static file dist/assets/avatars/avatar-0N.png (only the id is stored)
--   photo_path                 object name in the private bucket 'profile-photos' ("<user id>/<file>"); a new file name
--                              per upload, so every change is a new URL (cache refresh without cache headers)
--   photo_version              +1 on every image change
--   profile_setup_required     true only for members who sign up AFTER this migration is applied (new rows);
--                              every account existing before it - approved or still pending - is an existing member
--                              and is never forced
--   profile_setup_completed_at set by the first successful save
-- Members cannot write these columns directly (column UPDATE grant stays nickname-only, see 20261109010000); all
-- writes go through set_my_profile_image(), which only ever touches the caller's own row.

alter table public.profiles
  add column if not exists avatar_id smallint check (avatar_id between 1 and 8),
  add column if not exists photo_path text,
  add column if not exists photo_version integer not null default 0,
  add column if not exists profile_setup_required boolean not null default false,
  add column if not exists profile_setup_completed_at timestamptz;

-- All existing rows (any status, including accounts still waiting for approval) got profile_setup_required = false
-- from the column default above: existing members keep working unchanged, online and offline.

-- Every row created from now on (sign-up trigger or any client insert) starts as a new member that must set up a
-- profile image; nobody can insert a pre-completed / foreign image state.
create or replace function public.profiles_new_member_image_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  new.avatar_id := null;
  new.photo_path := null;
  new.photo_version := 0;
  new.profile_setup_required := true;
  new.profile_setup_completed_at := null;
  return new;
end;
$$;
drop trigger if exists profiles_new_member_image_defaults on public.profiles;
create trigger profiles_new_member_image_defaults before insert on public.profiles
  for each row execute function public.profiles_new_member_image_defaults();

-- ---- Storage: private bucket, own folder "<uid>/" ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- upload / delete: approved members, own folder only (no update: every image is a new object name)
create policy profile_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and public.is_approved() and (storage.foldername(name))[1] = auth.uid()::text);
create policy profile_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- read: the owner, and members who share a party with the owner (needed for the party list / map markers)
create policy profile_photos_select_own_or_party on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos' and public.is_approved() and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.party_members mine
        join public.party_members other on other.party_id = mine.party_id
        where mine.user_id = auth.uid() and other.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- ---- RPCs ----
-- Own image state (also tells the app whether the first-login setup is still due).
create or replace function public.get_my_profile_image()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('avatar_id', p.avatar_id, 'photo_path', p.photo_path, 'photo_version', p.photo_version,
    'setup_required', p.profile_setup_required, 'setup_completed_at', p.profile_setup_completed_at);
end;
$$;

-- Save the caller's image: exactly one of p_avatar_id (1..8) / p_photo_path (an object the caller already uploaded
-- into its own folder). Marks the setup completed. Returns the new state plus the previous photo path, which the
-- app deletes afterwards (a failed save changes nothing: the previous image stays).
create or replace function public.set_my_profile_image(p_avatar_id integer default null, p_photo_path text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); prev text; p public.profiles;
begin
  if uid is null or not public.is_approved() then raise exception 'Approved account required' using errcode = '42501'; end if;
  if (p_avatar_id is null) = (p_photo_path is null) then raise exception 'Exactly one of avatar or photo' using errcode = '22023'; end if;
  if p_avatar_id is not null and p_avatar_id not between 1 and 8 then raise exception 'Unknown avatar' using errcode = '22023'; end if;
  if p_photo_path is not null then
    if p_photo_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]{1,64}\.(webp|jpg|jpeg|png)$') then
      raise exception 'Photo must be in the caller''s own folder' using errcode = '42501';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = p_photo_path) then
      raise exception 'Photo not uploaded' using errcode = 'P0002';
    end if;
  end if;
  select photo_path into prev from public.profiles where id = uid for update;
  update public.profiles set avatar_id = p_avatar_id, photo_path = p_photo_path, photo_version = photo_version + 1,
    profile_setup_completed_at = coalesce(profile_setup_completed_at, now()), updated_at = now()
  where id = uid returning * into p;
  return jsonb_build_object('avatar_id', p.avatar_id, 'photo_path', p.photo_path, 'photo_version', p.photo_version,
    'setup_required', p.profile_setup_required, 'setup_completed_at', p.profile_setup_completed_at,
    'previous_photo_path', case when prev is distinct from p.photo_path then prev end);
end;
$$;

-- Image fields of the members of the caller's parties (same membership rule as list_my_party_members; the existing
-- member / location RPCs are unchanged, the app merges this result by user_id).
create or replace function public.list_my_party_member_profiles(p_party_id uuid default null)
returns table (party_id uuid, user_id uuid, avatar_id smallint, photo_path text, photo_version integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  return query
  select pm.party_id, pm.user_id, pr.avatar_id, pr.photo_path, pr.photo_version
  from public.party_members pm
  join public.profiles pr on pr.id = pm.user_id
  where (p_party_id is null or pm.party_id = p_party_id)
    and exists (select 1 from public.party_members own where own.party_id = pm.party_id and own.user_id = auth.uid());
end;
$$;

revoke all on function public.get_my_profile_image(), public.set_my_profile_image(integer, text),
  public.list_my_party_member_profiles(uuid) from public, anon;
grant execute on function public.get_my_profile_image(), public.set_my_profile_image(integer, text),
  public.list_my_party_member_profiles(uuid) to authenticated;
revoke all on function public.profiles_new_member_image_defaults() from public, anon, authenticated;

-- Account deletion: profiles rows cascade from auth.users; the photo objects are removed by the Edge Function
-- delete-my-account after a successful delete_own_account() (Storage objects are not deleted from SQL).
