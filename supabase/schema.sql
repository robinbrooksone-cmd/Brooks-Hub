-- Run this once in the Supabase SQL editor for your project.
-- The whole site's data lives as a single JSON document in one row.
-- Simple, and plenty for a low-traffic wedding site.

create table if not exists site_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_state enable row level security;

-- No client-side (anon key) access at all — every read/write goes through
-- Next.js server actions using the service role key, which bypasses RLS.
-- This keeps guest names/phone numbers/RSVPs out of reach of the public
-- anon key entirely.
