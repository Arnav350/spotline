-- =============================================================================
-- SPOTLINE — FULL SCHEMA
-- Drop everything and run fresh, or run on a new Supabase project.
-- Safe to re-run: uses CREATE OR REPLACE, IF NOT EXISTS, DROP IF EXISTS.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'User',
  created_at    timestamptz default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- SHOW FOLDERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists show_folders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade,
  title       text not null default 'New Folder',
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- FOLDER MEMBERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists folder_members (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid references show_folders(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner','editor','viewer')),
  joined_at  timestamptz default now(),
  unique(folder_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SHOWS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists shows (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid references auth.users(id),
  folder_id            uuid references show_folders(id) on delete set null,
  title                text not null default 'Untitled Show',
  stage_config         jsonb not null default '{"width":60,"height":40,"divisionsX":5,"divisionsY":5,"subdivisionsX":2,"subdivisionsY":2,"unit":"ft","maxTransitionSpeed":8}',
  bpm                  numeric,
  music_url            text,
  music_filename       text,
  music_storage_path   text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SHOW MEMBERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists show_members (
  id         uuid primary key default gen_random_uuid(),
  show_id    uuid references shows(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner','editor','viewer')),
  joined_at  timestamptz default now(),
  unique(show_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SHOW PUBLIC LINKS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists show_public_links (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid references shows(id) on delete cascade,
  token       uuid default gen_random_uuid() unique,
  created_by  uuid references auth.users(id),
  enabled     boolean not null default true,
  created_at  timestamptz default now(),
  unique(show_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INVITATIONS
-- show_id is nullable — folder invites set folder_id and leave show_id null.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists invitations (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid references shows(id) on delete cascade,
  folder_id      uuid references show_folders(id) on delete cascade,
  inviter_id     uuid references auth.users(id),
  invitee_email  text not null,
  token          uuid default gen_random_uuid() unique,
  role           text not null default 'editor' check (role in ('editor','viewer')),
  status         text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at     timestamptz default (now() + interval '7 days'),
  created_at     timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- FORMATIONS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists formations (
  id                   uuid primary key default gen_random_uuid(),
  show_id              uuid references shows(id) on delete cascade,
  name                 text not null default 'Formation',
  notes                text default '',
  duration             numeric not null default 8,
  transition_duration  numeric not null default 2,
  transition_easing    text default 'ease',
  order_index          integer not null default 0,
  created_at           timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PERFORMER GROUPS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists performer_groups (
  id           uuid primary key default gen_random_uuid(),
  show_id      uuid references shows(id) on delete cascade,
  name         text not null default 'Group',
  color        text not null default '#7c3aed',
  order_index  integer not null default 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PERFORMERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists performers (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid references shows(id) on delete cascade,
  name        text not null,
  color       text not null default '#7c3aed',
  shape       text not null default 'circle',
  group_id    uuid references performer_groups(id) on delete set null,
  order_index integer not null default 0,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROPS
-- width / depth replace the old single `size` dimension.
-- `size` is kept as a nullable legacy column so old rows still read correctly
-- (the app falls back to size when width/depth are absent).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists props (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid references shows(id) on delete cascade,
  name        text not null,
  color       text not null default '#888888',
  shape       text not null default 'square',
  width       numeric not null default 2,
  depth       numeric not null default 2,
  size        numeric,
  order_index integer not null default 0,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PERFORMER POSITIONS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists performer_positions (
  id            uuid primary key default gen_random_uuid(),
  performer_id  uuid references performers(id) on delete cascade,
  formation_id  uuid references formations(id) on delete cascade,
  x             numeric not null default 0,
  y             numeric not null default 0,
  cp_dx         numeric not null default 0,
  cp_dy         numeric not null default 0,
  unique(performer_id, formation_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROP POSITIONS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists prop_positions (
  id            uuid primary key default gen_random_uuid(),
  prop_id       uuid references props(id) on delete cascade,
  formation_id  uuid references formations(id) on delete cascade,
  x             numeric not null default 0,
  y             numeric not null default 0,
  unique(prop_id, formation_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIO SEGMENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists audio_segments (
  id           uuid primary key default gen_random_uuid(),
  show_id      uuid references shows(id) on delete cascade,
  name         text not null default 'Segment',
  duration     numeric not null default 8,
  order_index  integer not null default 0,
  color        text not null default '#7c3aed'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME
-- performer_positions and prop_positions are excluded — the app no longer
-- subscribes to their CDC events (position sync happens via formation broadcasts).
-- ─────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table shows;
alter publication supabase_realtime add table formations;
alter publication supabase_realtime add table performers;
alter publication supabase_realtime add table props;
alter publication supabase_realtime add table audio_segments;
alter publication supabase_realtime add table performer_groups;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE — audio bucket (private, per-show folders)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('audio', 'audio', false)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — enable on every table
-- ─────────────────────────────────────────────────────────────────────────────
alter table profiles            enable row level security;
alter table show_folders        enable row level security;
alter table folder_members      enable row level security;
alter table shows               enable row level security;
alter table show_members        enable row level security;
alter table invitations         enable row level security;
alter table formations          enable row level security;
alter table performer_groups    enable row level security;
alter table performers          enable row level security;
alter table props               enable row level security;
alter table performer_positions enable row level security;
alter table prop_positions      enable row level security;
alter table audio_segments      enable row level security;
alter table show_public_links   enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER HELPERS
-- Run as DB owner to bypass RLS when checking show_members, which prevents
-- infinite recursion in policies on other tables.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function is_show_member(show_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.show_members
    where show_id = show_uuid and user_id = auth.uid()
  );
$$;

create or replace function is_show_owner_or_editor(show_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.show_members
    where show_id = show_uuid and user_id = auth.uid() and role in ('owner','editor')
  );
$$;

create or replace function is_show_owner(show_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.show_members
    where show_id = show_uuid and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function is_public_show(show_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.show_public_links
    where show_id = show_uuid and enabled = true
  );
$$;

create or replace function get_show_from_public_token(public_token uuid)
returns uuid language sql security definer stable as $$
  select show_id from public.show_public_links
  where token = public_token and enabled = true
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCEPT SHOW INVITE RPC
-- Only matches invitations that have a show_id (not folder invites).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function cleanup_expired_invitations()
returns void language plpgsql security definer as $$
begin
  delete from invitations where expires_at < now() - interval '7 days';
end;
$$;

create or replace function accept_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv record;
begin
  perform cleanup_expired_invitations();
  select * into inv from invitations
  where token = invite_token
    and status = 'pending'
    and expires_at > now()
    and show_id is not null;
  if not found then
    return json_build_object('error', 'Invalid or expired invitation');
  end if;
  insert into show_members (show_id, user_id, role)
    values (inv.show_id, auth.uid(), inv.role)
    on conflict (show_id, user_id) do update set role = excluded.role;
  update invitations set status = 'accepted' where id = inv.id;
  return json_build_object('show_id', inv.show_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCEPT FOLDER INVITE RPC
-- Grants access to the folder + all shows currently inside it.
-- Shows added to the folder later get members granted by the on_show_folder_change trigger.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_folder_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv  record;
  s    record;
begin
  perform cleanup_expired_invitations();
  select * into inv from invitations
  where token = invite_token
    and status = 'pending'
    and expires_at > now()
    and folder_id is not null;
  if not found then
    return json_build_object('error', 'Invalid or expired folder invitation');
  end if;
  insert into folder_members (folder_id, user_id, role)
    values (inv.folder_id, auth.uid(), inv.role)
    on conflict (folder_id, user_id) do update set role = excluded.role;
  for s in select id from shows where folder_id = inv.folder_id loop
    insert into show_members (show_id, user_id, role)
      values (s.id, auth.uid(), inv.role)
      on conflict (show_id, user_id) do update set role = excluded.role;
  end loop;
  update invitations set status = 'accepted' where id = inv.id;
  return json_build_object('folder_id', inv.folder_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PUBLIC LINK RPC
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function upsert_public_link(p_show_id uuid, p_enabled boolean)
returns table(token uuid, enabled boolean) language plpgsql security definer as $$
declare
  link record;
begin
  if not is_show_owner(p_show_id) then
    raise exception 'Only show owners can manage public links';
  end if;
  insert into show_public_links (show_id, created_by, enabled)
    values (p_show_id, auth.uid(), p_enabled)
    on conflict (show_id) do update set enabled = p_enabled
  returning show_public_links.token, show_public_links.enabled into link;
  return query select link.token, link.enabled;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVITE LIMIT TRIGGER
-- Rejects if there are already 20 pending invitations for the same show/folder.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function check_invite_rate_limit()
returns trigger language plpgsql as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from invitations
  where status = 'pending'
    and (
      (new.show_id is not null and show_id = new.show_id)
      or (new.folder_id is not null and folder_id = new.folder_id)
    );
  if v_count >= 20 then
    raise exception 'Maximum of 20 pending invitations allowed per show or folder.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_invitation_rate_limit on invitations;
create trigger on_invitation_rate_limit
  before insert on invitations
  for each row execute function check_invite_rate_limit();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — profiles
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Anyone can read profiles"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — show_folders
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Folder owners and members can read folders"
  on show_folders for select using (
    owner_id = auth.uid()
    or exists (select 1 from folder_members where folder_id = show_folders.id and user_id = auth.uid())
    or exists (
      select 1 from shows s
      join show_members sm on sm.show_id = s.id
      where s.folder_id = show_folders.id and sm.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create folders"
  on show_folders for insert with check (auth.uid() is not null);

create policy "Folder owners can update folders"
  on show_folders for update using (owner_id = auth.uid());

create policy "Folder owners can delete folders"
  on show_folders for delete using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — folder_members
-- SELECT is covered by the user-scoped policy only (no cross-table lookup),
-- which avoids infinite recursion with the show_folders SELECT policy.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Users can read own folder membership"
  on folder_members for select using (user_id = auth.uid());

create policy "Folder owners can insert folder members"
  on folder_members for insert with check (
    exists (select 1 from show_folders where id = folder_id and owner_id = auth.uid())
  );

create policy "Folder owners can update folder members"
  on folder_members for update using (
    exists (select 1 from show_folders where id = folder_id and owner_id = auth.uid())
  );

create policy "Folder owners can delete folder members"
  on folder_members for delete using (
    exists (select 1 from show_folders where id = folder_id and owner_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — shows
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can read shows"
  on shows for select using (is_show_member(id));

create policy "Owners and editors can update shows"
  on shows for update using (is_show_owner_or_editor(id));

create policy "Authenticated users can create shows"
  on shows for insert with check (owner_id = auth.uid());

create policy "Owners can delete shows"
  on shows for delete using (is_show_owner(id));

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — show_members
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can read show_members"
  on show_members for select using (is_show_member(show_id));

create policy "Owners can manage show_members"
  on show_members for all using (is_show_owner(show_id));

create policy "Allow insert own membership"
  on show_members for insert with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — invitations
-- Both show and folder invites are covered; the show_id/folder_id may be null
-- depending on the invite type.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can read invitations"
  on invitations for select using (
    (show_id is not null and is_show_member(show_id))
    or (folder_id is not null and exists (
      select 1 from show_folders where id = folder_id and owner_id = auth.uid()
    ))
  );

create policy "Owners and editors can create invitations"
  on invitations for insert with check (
    (show_id is not null and is_show_owner_or_editor(show_id))
    or (folder_id is not null and exists (
      select 1 from show_folders where id = folder_id and owner_id = auth.uid()
    ))
  );

create policy "Owners and editors can update invitations"
  on invitations for update using (
    (show_id is not null and is_show_owner_or_editor(show_id))
    or (folder_id is not null and exists (
      select 1 from show_folders where id = folder_id and owner_id = auth.uid()
    ))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — show_public_links
-- Owners can manage their own link. The security-definer RPCs (is_public_show,
-- get_show_from_public_token) bypass RLS, so no extra select policy is needed.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Owners can manage public links"
  on show_public_links for all using (is_show_owner(show_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — formations, performers, props
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can access formations"
  on formations for all using (is_show_member(show_id));

create policy "Members can access performers"
  on performers for all using (is_show_member(show_id));

create policy "Members can access props"
  on props for all using (is_show_member(show_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — positions (look up show_id via formation)
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can access performer_positions"
  on performer_positions for all
  using (is_show_member((select show_id from formations where id = formation_id)));

create policy "Members can access prop_positions"
  on prop_positions for all
  using (is_show_member((select show_id from formations where id = formation_id)));

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — performer_groups
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can access performer_groups"
  on performer_groups for all using (is_show_member(show_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — audio_segments
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can access audio_segments"
  on audio_segments for all using (is_show_member(show_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE POLICIES — audio bucket
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Members can read audio"
  on storage.objects for select
  using (bucket_id = 'audio' and is_show_member((storage.foldername(name))[1]::uuid));

create policy "Members can upload audio"
  on storage.objects for insert
  with check (bucket_id = 'audio' and is_show_member((storage.foldername(name))[1]::uuid));

create policy "Members can delete audio"
  on storage.objects for delete
  using (bucket_id = 'audio' and is_show_member((storage.foldername(name))[1]::uuid));

-- ─────────────────────────────────────────────────────────────────────────────
-- PUBLIC READ POLICIES — anonymous access for enabled public links
-- ─────────────────────────────────────────────────────────────────────────────
create policy "Public can read shows"
  on shows for select using (is_public_show(id));

create policy "Public can read formations"
  on formations for select using (is_public_show(show_id));

create policy "Public can read performers"
  on performers for select using (is_public_show(show_id));

create policy "Public can read props"
  on props for select using (is_public_show(show_id));

create policy "Public can read performer_groups"
  on performer_groups for select using (is_public_show(show_id));

create policy "Public can read audio_segments"
  on audio_segments for select using (is_public_show(show_id));

create policy "Public can read performer_positions"
  on performer_positions for select
  using (is_public_show((select show_id from formations where id = formation_id)));

create policy "Public can read prop_positions"
  on prop_positions for select
  using (is_public_show((select show_id from formations where id = formation_id)));

create policy "Public can read audio"
  on storage.objects for select
  using (bucket_id = 'audio' and is_public_show((storage.foldername(name))[1]::uuid));

-- ─────────────────────────────────────────────────────────────────────────────
-- FOLDER AUTO-GRANT TRIGGER
-- When a show is moved into a folder, automatically grants all existing folder
-- members access to that show. Eliminates split responsibility with app layer.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function auto_grant_folder_members()
returns trigger language plpgsql security definer as $$
begin
  if new.folder_id is null then return new; end if;
  if old.folder_id is not distinct from new.folder_id then return new; end if;

  insert into show_members (show_id, user_id, role)
  select new.id, fm.user_id, fm.role
  from folder_members fm
  where fm.folder_id = new.folder_id
    and fm.user_id != new.owner_id
  on conflict (show_id, user_id) do update set role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_show_folder_change on shows;
create trigger on_show_folder_change
  after update of folder_id on shows
  for each row execute function auto_grant_folder_members();

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK DISPOSABLE EMAIL DOMAINS ON SIGNUP
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function block_disposable_email()
returns trigger
language plpgsql
security definer
as $$
declare
  v_domain text;
  disposable_domains text[] := array[
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.info', 'grr.la',
    'sharklasers.com', 'guerrillamailblock.com', 'spam4.me', 'yopmail.com',
    'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx',
    'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf',
    'monemail.fr.nf', 'monmail.fr.nf', 'tempmail.com', 'temp-mail.org',
    'throwam.com', 'throwam.net', 'dispostable.com', 'mailnull.com',
    'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org', 'trashmail.at',
    'trashmail.com', 'trashmail.io', 'trashmail.me', 'trashmail.net',
    'trashmail.org', 'trashmail.xyz', 'wegwerfmail.de', 'wegwerfmail.net',
    'wegwerfmail.org', 'maildrop.cc', 'mailnesia.com', 'mailnull.com',
    'spamspot.com', 'spamthis.co.uk', 'spamtroll.net', 'temporaryemail.net',
    'temporaryinbox.com', 'throwaway.email', 'filzmail.com', 'getnada.com',
    'mohmal.com', 'spamfree24.org', 'tempinbox.com', 'tempinbox.co.uk',
    'tempomail.fr', 'thanksnospam.info', 'trbvm.com', 'mailexpire.com',
    'fakeinbox.com', 'antichef.com', 'antichef.net', 'antispam24.de',
    'chacuo.net', 'deadaddress.com', 'discardmail.com', 'discardmail.de',
    'discard.email', 'e4ward.com', 'emaildienst.de', 'emailias.com',
    'emailinfive.com', 'emailtemporanea.com', 'emailtemporanea.net',
    'emailtemporanea.org', 'fakeemailgenerator.com', 'filzmail.com',
    'fizmail.com', 'kurzepost.de', 'letthemeatspam.com', 'lortemail.dk',
    'mt2009.com', 'mt2014.com', 'mytrashmail.com', 'netmails.com',
    'nobulk.com', 'noclickemail.com', 'nogmailspam.info', 'nospamfor.us',
    'nowmymail.com', 'objectmail.com', 'obobbo.com', 'oneoffemail.com',
    'onewaymail.com', 'pookmail.com', 'putthisinyourspamdatabase.com',
    'rcpt.at', 'recode.me', 'regbypass.com', 'rklips.com',
    'safe-mail.net', 'safetypost.de', 'sandelf.de', 'schafmail.de',
    'schrott-email.de', 'secretemail.de', 'secure-mail.biz',
    'selfdestructingmail.com', 'sendspamhere.com', 'shiftmail.com',
    'skeefmail.com', 'slopsbox.com', 'snakemail.com', 'sneakemail.com',
    'snkmail.com', 'sofimail.com', 'sofort-mail.de', 'sogetthis.com',
    'spam.la', 'spam.su', 'spamavert.com', 'spambob.com', 'spambob.net',
    'spambob.org', 'spambog.com', 'spambog.de', 'spambog.ru',
    'spambox.info', 'spambox.us', 'spamcannon.com', 'spamcannon.net',
    'spamcon.org', 'spamcorpse.com', 'spamevader.com', 'spamfree.eu',
    'spamfree24.de', 'spamfree24.eu', 'spamfree24.info', 'spamfree24.net',
    'spamgoes.in', 'spamhole.com', 'spamify.com', 'spaminator.de',
    'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com',
    'spammy.host', 'spamoff.de', 'spamsalad.in', 'spamsphere.com',
    'spamstack.net', 'spamthisplease.com', 'spamwc.de', 'spamwc.net',
    'spamwc.org', 'spikio.com', 'suremail.info', 'sweetxxx.de',
    'techemail.com', 'techgroup.me', 'teleworm.com', 'teleworm.us',
    'temp-mail.ru', 'tempail.com', 'tempalias.com', 'tempe-mail.com',
    'tempemail.co.za', 'tempemail.com', 'tempemail.net', 'tempmail.de',
    'tempmail.eu', 'tempmail.it', 'tempmaildemo.com', 'tempmailer.com',
    'tempmailer.de', 'temporaryemail.net', 'temporaryforwarding.com',
    'temporarymailaddress.com', 'tempthe.net', 'thisisnotmyrealemail.com',
    'throam.com', 'throwam.com', 'tilien.com', 'tmailinator.com',
    'tradermail.info', 'trash-amil.com', 'trash-mail.at', 'trash-mail.com',
    'trash-mail.de', 'trash-mail.ga', 'trash-mail.io', 'trash-mail.net',
    'trash2009.com', 'trash2010.com', 'trash2011.com', 'trashdevil.com',
    'trashdevil.de', 'trashemail.de', 'trashimail.de', 'trashmail.app',
    'trashmail.at', 'trashmail.com', 'trashmail.de', 'trashmail.io',
    'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.se',
    'trashmail.xyz', 'trashmailer.com', 'turual.com', 'twinmail.de',
    'tyldd.com', 'venompen.com', 'veryrealemail.com', 'webm4il.info',
    'wegwerfadresse.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
    'wuzupmail.net', 'xagloo.com', 'xemaps.com', 'xents.com',
    'xmaily.com', 'xoxy.net', 'yepmail.net', 'yogamaven.com',
    'yopmail.com', 'yopmail.fr', 'yuurok.com', 'z1p.biz',
    'zehnminuten.de', 'zehnminutenmail.de', 'zippymail.info',
    'zoemail.net', 'zoemail.org', 'zomg.info'
  ];
begin
  v_domain := lower(split_part(new.email, '@', 2));
  if v_domain = any(disposable_domains) then
    raise exception 'Disposable email addresses are not allowed.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_block_disposable on auth.users;
create trigger on_auth_user_created_block_disposable
  before insert on auth.users
  for each row execute function block_disposable_email();

-- ─────────────────────────────────────────────────────────────────────────────
-- AI GENERATION RATE LIMITING
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ai_generations (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) not null,
  created_at timestamptz default now() not null
);

alter table ai_generations enable row level security;

drop policy if exists "Users can view own" on ai_generations;
create policy "Users can view own" on ai_generations
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own" on ai_generations;
create policy "Users can insert own" on ai_generations
  for insert with check (auth.uid() = user_id);

create index if not exists ai_generations_user_created_idx on ai_generations (user_id, created_at);

create or replace function try_log_ai_generation(p_limit int)
returns int
language plpgsql
as $$
declare
  v_used int;
  v_lock bigint;
begin
  v_lock := ('x' || substr(md5(auth.uid()::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  select count(*) into v_used
  from ai_generations
  where user_id = auth.uid()
    and created_at >= now() - interval '7 days';

  if v_used >= p_limit then
    return -1;
  end if;

  insert into ai_generations (user_id) values (auth.uid());
  return p_limit - v_used - 1;
end;
$$;

