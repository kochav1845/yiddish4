/*
  # Create Dataset Items Table and Storage Bucket

  ## Summary
  This migration sets up the infrastructure for the audio dataset management feature,
  allowing users to upload audio files with their transcriptions/descriptions and
  export them as training datasets.

  ## New Tables

  ### `dataset_items`
  Stores metadata for uploaded audio dataset entries.
  - `id` - Unique identifier (uuid)
  - `user_id` - References the owning user (auth.users)
  - `filename` - Original filename of the uploaded audio
  - `storage_path` - Path to the file in Supabase Storage (dataset-audio bucket)
  - `transcription` - The text label/description for this audio clip
  - `language` - Language of the audio content (default: yiddish)
  - `duration_seconds` - Optional audio duration
  - `file_size_bytes` - Optional file size
  - `created_at` - Timestamp of creation

  ## Security

  ### Row Level Security
  - RLS is enabled on `dataset_items`
  - Users can only SELECT their own items (user_id = auth.uid())
  - Users can only INSERT items belonging to themselves
  - Users can only DELETE their own items
  - No UPDATE policy (items are immutable once created)

  ### Storage Policies
  - Creates `dataset-audio` private storage bucket (50MB file limit)
  - Users can only upload files into their own folder (/{user_id}/...)
  - Users can only read files from their own folder
  - Users can only delete their own files

  ## Important Notes
  1. Storage bucket uses folder-based isolation: each user's files are stored under `{user_id}/`
  2. Bucket is private (not publicly accessible)
  3. Allowed audio MIME types: mp3, wav, mp4, webm, ogg, flac, m4a
*/

CREATE TABLE IF NOT EXISTS dataset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  transcription text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'yiddish',
  duration_seconds numeric,
  file_size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dataset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dataset items"
  ON dataset_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dataset items"
  ON dataset_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dataset items"
  ON dataset_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dataset-audio',
  'dataset-audio',
  false,
  52428800,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/flac', 'audio/x-m4a', 'audio/aac', 'audio/mp3']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Dataset users can upload own audio files'
  ) THEN
    CREATE POLICY "Dataset users can upload own audio files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'dataset-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Dataset users can view own audio files'
  ) THEN
    CREATE POLICY "Dataset users can view own audio files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'dataset-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Dataset users can delete own audio files'
  ) THEN
    CREATE POLICY "Dataset users can delete own audio files"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'dataset-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
