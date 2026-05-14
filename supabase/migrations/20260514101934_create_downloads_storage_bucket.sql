/*
  # Create downloads storage bucket

  ## Summary
  Creates a public storage bucket for hosting downloadable files (VoicePaste.exe and future releases).

  ## New Buckets
  - `downloads` — public bucket for distributable files like VoicePaste.exe

  ## Security
  - Public read access for anyone (unauthenticated) so users can download the exe
  - Only authenticated admins can upload/delete files (via service role in edge functions or RLS)
  - INSERT/DELETE restricted to authenticated users (admin check done in application layer)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'downloads',
  'downloads',
  true,
  104857600, -- 100 MB limit
  ARRAY['application/octet-stream', 'application/x-msdownload', 'application/exe', 'application/x-executable']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read (anyone can download)
CREATE POLICY "Public can download files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'downloads');

-- Only authenticated users can upload (admin check in app layer)
CREATE POLICY "Authenticated users can upload downloads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'downloads');

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete downloads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'downloads');

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update downloads"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'downloads')
  WITH CHECK (bucket_id = 'downloads');
