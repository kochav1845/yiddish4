/*
  # Create visitor_popup_shown table

  Tracks which visitor IPs have already been shown the contact/feedback popup,
  so it is only displayed once per unique IP address.

  1. New Tables
    - `visitor_popup_shown`
      - `ip_hash` (text, primary key) — SHA-256 hash of the visitor's IP for privacy
      - `created_at` (timestamptz) — when the popup was first shown

  2. Security
    - RLS enabled; the table is only ever written from the service-role
      key inside the check-visitor edge function — no direct client access needed.
    - No SELECT/INSERT policies for client roles (edge function uses service role).
*/

CREATE TABLE IF NOT EXISTS visitor_popup_shown (
  ip_hash   text        PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE visitor_popup_shown ENABLE ROW LEVEL SECURITY;
