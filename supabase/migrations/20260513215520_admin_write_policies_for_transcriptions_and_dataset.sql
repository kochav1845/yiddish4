/*
  # Admin write policies for transcriptions and dataset

  ## Summary
  Gives the admin full write access so they can:
  1. Edit (UPDATE) any user's transcription text from the admin panel
  2. Insert dataset items on behalf of any user (attributing to the original contributor)
  3. Upload audio files to the dataset-audio bucket from the admin panel
     (needed when copying a transcription recording into the dataset)

  ## Changes

  ### transcriptions table
  - New UPDATE policy: admins can update any row

  ### dataset_items table
  - New INSERT policy: admins can insert rows (user_id not required to match auth.uid())

  ### storage.objects — dataset-audio bucket
  - New INSERT policy: admins can upload to any path in dataset-audio
*/

-- Admin can update any transcription
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transcriptions'
    AND policyname = 'Admins can update any transcription'
  ) THEN
    CREATE POLICY "Admins can update any transcription"
      ON transcriptions FOR UPDATE
      TO authenticated
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- Admin can insert dataset items for any user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dataset_items'
    AND policyname = 'Admins can insert dataset items'
  ) THEN
    CREATE POLICY "Admins can insert dataset items"
      ON dataset_items FOR INSERT
      TO authenticated
      WITH CHECK (is_admin());
  END IF;
END $$;

-- Admin can upload to dataset-audio bucket at any path
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Admins can upload to dataset-audio'
  ) THEN
    CREATE POLICY "Admins can upload to dataset-audio"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'dataset-audio'
        AND is_admin()
      );
  END IF;
END $$;
