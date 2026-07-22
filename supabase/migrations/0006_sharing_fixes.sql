-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. Folder editors can invite (and revoke invites), matching shows
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Owners and editors can create invitations" on invitations;
create policy "Owners and editors can create invitations"
  on invitations for insert with check (
    (show_id is not null and is_show_owner_or_editor(show_id))
    or (folder_id is not null and (
      exists (select 1 from show_folders where id = folder_id and owner_id = auth.uid())
      or exists (select 1 from folder_members where folder_id = invitations.folder_id and user_id = auth.uid() and role in ('owner','editor'))
    ))
  );

drop policy if exists "Owners and editors can update invitations" on invitations;
create policy "Owners and editors can update invitations"
  on invitations for update using (
    (show_id is not null and is_show_owner_or_editor(show_id))
    or (folder_id is not null and (
      exists (select 1 from show_folders where id = folder_id and owner_id = auth.uid())
      or exists (select 1 from folder_members where folder_id = invitations.folder_id and user_id = auth.uid() and role in ('owner','editor'))
    ))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Show members (any role) can read the show's public link row, so editors
-- and viewers can see/copy an enabled link. Only owners can insert/update/delete
-- it (existing "Owners can manage public links" for-all policy is unaffected).
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can view public link"
  on show_public_links for select using (is_show_member(show_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. Folder owners can see all of their own folder's members, not just their
-- own row. security definer avoids recursing into the show_folders policy.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function is_folder_owner(p_folder_id uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from show_folders where id = p_folder_id and owner_id = auth.uid())
$$;

drop policy if exists "Users can read own folder membership" on folder_members;
create policy "Users can read own folder membership or folder members they own"
  on folder_members for select using (
    user_id = auth.uid() or is_folder_owner(folder_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 1d. Folder membership is authoritative over show-level access: block direct
-- role changes or removal on show_members for a user whose access to that show
-- is derived from folder membership. Internal sync paths (the folder->show
-- grant trigger and accept_folder_invite) bypass this via a transaction-local
-- flag they set immediately before writing.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function guard_folder_managed_show_member()
returns trigger language plpgsql as $$
declare
  v_folder_id uuid;
  v_target_user uuid := coalesce(new.user_id, old.user_id);
  v_show_id uuid := coalesce(new.show_id, old.show_id);
begin
  if current_setting('spotline.folder_sync', true) = 'true' then
    return coalesce(new, old);
  end if;

  select folder_id into v_folder_id from shows where id = v_show_id;
  if v_folder_id is not null and exists (
    select 1 from folder_members where folder_id = v_folder_id and user_id = v_target_user
  ) then
    raise exception 'This member''s access to this show is managed through the folder. Change their folder role or remove them from the folder instead.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_show_member_folder_guard on show_members;
create trigger on_show_member_folder_guard
  before update of role or delete on show_members
  for each row execute function guard_folder_managed_show_member();

create or replace function auto_grant_folder_members()
returns trigger language plpgsql security definer as $$
begin
  if new.folder_id is null then return new; end if;
  if old.folder_id is not distinct from new.folder_id then return new; end if;

  perform set_config('spotline.folder_sync', 'true', true);
  insert into show_members (show_id, user_id, role)
  select new.id, fm.user_id, fm.role
  from folder_members fm
  where fm.folder_id = new.folder_id
    and fm.user_id != new.owner_id
  on conflict (show_id, user_id) do update set role = excluded.role;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1e. Keep show access in sync when a folder role changes, so 1d's guard never
-- locks in stale drift between a member's folder role and their show role.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function sync_folder_role_to_shows()
returns trigger language plpgsql security definer as $$
begin
  if new.role = old.role then return new; end if;
  perform set_config('spotline.folder_sync', 'true', true);
  update show_members sm
  set role = new.role
  from shows s
  where s.id = sm.show_id
    and s.folder_id = new.folder_id
    and sm.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_folder_member_role_change on folder_members;
create trigger on_folder_member_role_change
  after update of role on folder_members
  for each row execute function sync_folder_role_to_shows();

-- ─────────────────────────────────────────────────────────────────────────────
-- accept_folder_invite also grants show_members access on the folder's behalf,
-- so it needs to bypass the 1d guard the same way auto_grant_folder_members does.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_folder_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv  record;
  s    record;
begin
  perform cleanup_expired_invitations();
  select * into inv from invitations
    where token = invite_token and status = 'pending' and folder_id is not null and expires_at > now();
  if not found then
    return json_build_object('error', 'Invalid or expired folder invitation');
  end if;
  insert into folder_members (folder_id, user_id, role)
    values (inv.folder_id, auth.uid(), inv.role)
    on conflict (folder_id, user_id) do update set role = excluded.role;
  perform set_config('spotline.folder_sync', 'true', true);
  for s in select id from shows where folder_id = inv.folder_id loop
    insert into show_members (show_id, user_id, role)
      values (s.id, auth.uid(), inv.role)
      on conflict (show_id, user_id) do update set role = excluded.role;
  end loop;
  update invitations set status = 'accepted' where id = inv.id;
  return json_build_object('folder_id', inv.folder_id);
end;
$$;
