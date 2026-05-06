import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const ADMIN_EMAIL = "a88933513@gmail.com";

export interface Profile {
  id: string;
  email: string | null;
  created_at: string;
}

export interface Transcription {
  id: string;
  user_id: string | null;
  filename: string;
  transcription: string;
  language: string;
  output_language: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  created_at: string;
}

export interface DatasetItem {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  transcription: string;
  language: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  created_at: string;
}
