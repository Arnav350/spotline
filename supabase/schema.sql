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
  stage_config         jsonb not null default '{"width":60,"height":40,"divisionsX":5,"divisionsY":5,"subdivisionsX":2,"subdivisionsY":2,"unit":"ft"}',
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
  id       uuid primary key default gen_random_uuid(),
  show_id  uuid references shows(id) on delete cascade,
  name     text not null default 'Group',
  color    text not null default '#7c3aed'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCEPT SHOW INVITE RPC
-- Only matches invitations that have a show_id (not folder invites).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv record;
begin
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
-- Shows added to the folder later get members added by the app layer
-- (see addShowToFolder in dashboardHelpers.ts).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_folder_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv  record;
  s    record;
begin
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
  on shows for insert with check (auth.uid() is not null);

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
