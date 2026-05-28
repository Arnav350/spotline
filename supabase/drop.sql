-- =============================================================================
-- SPOTLINE — DROP EVERYTHING
-- Wipes all Spotline tables, functions, triggers, and storage policies.
-- Run in Supabase Dashboard → SQL Editor.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage policies
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Members can read audio"   on storage.objects;
drop policy if exists "Members can upload audio" on storage.objects;
drop policy if exists "Members can delete audio" on storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables (cascade drops all dependent policies and constraints)
-- Order matters: dependents before their parents.
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists audio_segments       cascade;
drop table if exists prop_positions       cascade;
drop table if exists performer_positions  cascade;
drop table if exists props                cascade;
drop table if exists performers           cascade;
drop table if exists performer_groups     cascade;
drop table if exists formations           cascade;
drop table if exists invitations          cascade;
drop table if exists show_members         cascade;
drop table if exists shows                cascade;
drop table if exists folder_members       cascade;
drop table if exists show_folders         cascade;
drop table if exists profiles             cascade;

-- ─────────────────────────────────────────────────────────────────────────────
-- Functions and triggers
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();
drop function if exists is_show_member(uuid);
drop function if exists is_show_owner_or_editor(uuid);
drop function if exists is_show_owner(uuid);
drop function if exists accept_invite(uuid);
drop function if exists accept_folder_invite(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket
-- Supabase blocks direct SQL deletion from storage tables.
-- To delete the audio bucket: Supabase Dashboard → Storage → audio → Delete bucket
-- ─────────────────────────────────────────────────────────────────────────────
