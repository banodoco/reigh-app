-- Make timeline-assets bucket public so assets can be loaded via getPublicUrl
-- instead of createSignedUrl (which takes 15-25s on production).
-- Write policies remain unchanged — only authenticated users can upload to their own folder.
update storage.buckets
set public = true
where id = 'timeline-assets';

-- Add a public read policy so anyone can read (bucket is public now)
drop policy if exists "timeline_assets_public_read" on storage.objects;
create policy "timeline_assets_public_read"
  on storage.objects
  for select
  using (bucket_id = 'timeline-assets');
