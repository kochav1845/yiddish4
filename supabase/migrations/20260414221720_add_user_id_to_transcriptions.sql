/*
  # Add user_id column to transcriptions

  1. Changes
    - Adds `user_id` (uuid) column referencing auth.users
    - Adds index on user_id for query performance
  2. Security
    - Enables RLS (if not already)
    - Adds policies so users can only access their own rows
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transcriptions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE transcriptions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transcriptions_user_id_idx ON transcriptions(user_id);

ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transcriptions' AND policyname = 'Users can view own transcriptions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can view own transcriptions"
        ON transcriptions FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transcriptions' AND policyname = 'Users can insert own transcriptions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can insert own transcriptions"
        ON transcriptions FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transcriptions' AND policyname = 'Users can delete own transcriptions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can delete own transcriptions"
        ON transcriptions FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id);
    $policy$;
  END IF;
END $$;
