-- Scan-/Handschrift-Erkennung für bildbasierte PDF-Protokolle.
alter table public.protokolle
  add column if not exists page_image_paths jsonb not null default '[]'::jsonb;

alter table public.protokolle
  drop constraint if exists protokolle_page_image_paths_array;

alter table public.protokolle
  add constraint protokolle_page_image_paths_array
  check (jsonb_typeof(page_image_paths) = 'array');

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/rtf',
  'text/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'image/jpeg'
]
where id = 'protokolle';
