-- Add pointer_username to users table
alter table users add column if not exists pointer_username text;

-- Bumblebee user preferences
create table if not exists bumblebee_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null unique,
  enabled boolean default false,
  radius_mode text not null default 'distance' check (radius_mode in ('distance', 'eta')),
  radius_km float default 1.0,
  eta_minutes float default 10.0,
  transport_mode text default 'walking' check (transport_mode in ('walking', 'driving')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notification events for deduplication / cooldown
create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  poi_id text not null,
  poi_name text not null,
  poi_lat float not null,
  poi_lng float not null,
  blurb text default '',
  eta_minutes float,
  distance_km float,
  notified_at timestamptz default now()
);

-- Index for cooldown lookups
create index if not exists idx_notification_events_user_poi
  on notification_events(user_id, poi_id, notified_at desc);
