-- Allow show owners to upload audio even before show_members row exists.
-- The copy in duplicateShow runs after the show row is inserted but the
-- existing "Members can upload audio" policy only checks show_members,
-- which may not exist yet at copy time.

drop policy if exists "Members can upload audio" on storage.objects;

create policy "Members can upload audio"
  on storage.objects for insert
  with check (
    bucket_id = 'audio' and (
      is_show_member((storage.foldername(name))[1]::uuid)
      or exists (
        select 1 from shows
        where id = (storage.foldername(name))[1]::uuid
          and owner_id = auth.uid()
      )
    )
  );
