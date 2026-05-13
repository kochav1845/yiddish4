/*
  # Add raw_transcription column to transcriptions

  ## Summary
  Adds a `raw_transcription` column to store the original Whisper model output
  before AI correction. This lets admins compare the raw and corrected versions
  side-by-side in the admin panel.

  ## Changes
  - `transcriptions` table: new nullable column `raw_transcription` (text)
    — null for older rows that predate this change
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transcriptions' AND column_name = 'raw_transcription'
  ) THEN
    ALTER TABLE transcriptions ADD COLUMN raw_transcription text;
  END IF;
END $$;
