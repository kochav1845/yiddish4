/*
  # Admin Storage Policy for Dataset Audio

  ## Summary
  Adds a storage SELECT policy allowing admins to read all files in the
  dataset-audio bucket. Without this, admins cannot generate signed URLs
  for recordings uploaded by other users.

  ## Changes
  - Adds "Admins can read all dataset audio files" SELECT policy on storage.objects
    restricted to bucket_id = 'dataset-audio' and is_admin() = true
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Admins can read all dataset audio files'
  ) THEN
    CREATE POLICY "Admins can read all dataset audio files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'dataset-audio'
        AND is_admin()
      );
  END IF;
END $$;
