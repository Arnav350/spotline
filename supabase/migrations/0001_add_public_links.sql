-- =============================================================================
-- MIGRATION 0001 — Public view-only links for shows
-- Safe to run on a live database: purely additive, no existing data touched.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE
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

alter table show_public_links enable row level security;

create policy "Owners can manage public links"
  on show_public_links for all using (is_show_owner(show_id));

create policy "Anyone can read public links"
  on show_public_links for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER — used by all SELECT policies below
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function is_public_show(show_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.show_public_links
    where show_id = show_uuid and enabled = true
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Resolve token → show_id (called before auth, uses anon key)
create or replace function get_show_from_public_token(public_token uuid)
returns uuid language sql security definer stable as $$
  select show_id from public.show_public_links
  where token = public_token and enabled = true
  limit 1;
$$;

-- Create or toggle the public link (owner only)
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
-- SELECT POLICIES — allow anonymous reads for public shows
-- Postgres ORs permissive policies, so these sit alongside the existing
-- is_show_member() policies without replacing them.
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
