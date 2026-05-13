/*
  # Add audio storage to transcriptions

  ## Summary
  Adds a `storage_path` column to the `transcriptions` table so that the
  original audio recording can be saved alongside the transcription text.
  Also creates a private `transcription-audio` storage bucket with policies
  so users can manage their own files and admins can read all files.

  ## Changes

  ### transcriptions table
  - New column: `storage_path` (text, nullable) — path inside the
    `transcription-audio` bucket, e.g. `{user_id}/{uuid}.webm`

  ### Storage
  - New private bucket: `transcription-audio`
  - INSERT policy: authenticated users can upload to their own folder
  - SELECT policy: users can read their own files; admins can read all
  - DELETE policy: users can delete their own files; admins can delete all
*/

-- 1. Add storage_path column to transcriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transcriptions' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE transcriptions ADD COLUMN storage_path text;
  END IF;
END $$;

-- 2. Create the storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'transcription-audio',
  'transcription-audio',
  false,
  104857600  -- 100 MB
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies

-- Users can upload their own files (path starts with their user id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can upload own transcription audio'
  ) THEN
    CREATE POLICY "Users can upload own transcription audio"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'transcription-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Users can read their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can read own transcription audio'
  ) THEN
    CREATE POLICY "Users can read own transcription audio"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'transcription-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Admins can read all transcription audio files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Admins can read all transcription audio'
  ) THEN
    CREATE POLICY "Admins can read all transcription audio"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'transcription-audio'
        AND is_admin()
      );
  END IF;
END $$;

-- Users can delete their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can delete own transcription audio'
  ) THEN
    CREATE POLICY "Users can delete own transcription audio"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'transcription-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
