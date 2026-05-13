/*
  # Create logos storage bucket

  ## Summary
  Creates a public storage bucket for the site logo, with policies allowing
  admins to upload/replace the logo and anyone to read it publicly.

  ## Changes
  - New public bucket: `logos`
  - SELECT policy: public read access (anon + authenticated)
  - INSERT policy: admin only
  - UPDATE policy: admin only
  - DELETE policy: admin only
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  5242880,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'logos');

CREATE POLICY "Admin can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND is_admin()
  );

CREATE POLICY "Admin can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logos' AND is_admin())
  WITH CHECK (bucket_id = 'logos' AND is_admin());

CREATE POLICY "Admin can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos' AND is_admin());
