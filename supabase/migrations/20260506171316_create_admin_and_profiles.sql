/*
  # Admin System and User Profiles

  ## Summary
  Sets up an admin role for a88933513@gmail.com with access to all user and
  transcription data. Also creates a profiles table to track all logged-in users.

  ## Order of operations
  1. admins table (no RLS yet — needed before is_admin() can reference it)
  2. Seed admin email
  3. is_admin() function
  4. Enable RLS + policies on admins
  5. profiles table + policies + trigger + backfill
  6. Admin SELECT policies on transcriptions and dataset_items
*/

-- ─── 1. admins table (RLS added after is_admin() exists) ─────────────────────

CREATE TABLE IF NOT EXISTS admins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text UNIQUE NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ─── 2. Seed admin ─────────────────────────────────────────────────────────────

INSERT INTO admins (email)
VALUES ('a88933513@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- ─── 3. is_admin() — SECURITY DEFINER so it bypasses RLS on admins ────────────

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE email = (auth.jwt() ->> 'email')
  );
$$;

-- ─── 4. RLS + policies on admins ──────────────────────────────────────────────

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admins' AND policyname = 'Admins can view admins table'
  ) THEN
    CREATE POLICY "Admins can view admins table"
      ON admins FOR SELECT
      TO authenticated
      USING (is_admin());
  END IF;
END $$;

-- ─── 5. profiles table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
      ON profiles FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
      ON profiles FOR SELECT
      TO authenticated
      USING (is_admin());
  END IF;
END $$;

-- Trigger: auto-create profile on signup

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (NEW.id, NEW.email, NEW.created_at)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  END IF;
END $$;

-- Backfill existing users

INSERT INTO profiles (id, email, created_at)
SELECT id, email, created_at FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Admin SELECT policies on transcriptions and dataset_items ─────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transcriptions' AND policyname = 'Admins can view all transcriptions'
  ) THEN
    CREATE POLICY "Admins can view all transcriptions"
      ON transcriptions FOR SELECT
      TO authenticated
      USING (is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dataset_items' AND policyname = 'Admins can view all dataset items'
  ) THEN
    CREATE POLICY "Admins can view all dataset items"
      ON dataset_items FOR SELECT
      TO authenticated
      USING (is_admin());
  END IF;
END $$;
