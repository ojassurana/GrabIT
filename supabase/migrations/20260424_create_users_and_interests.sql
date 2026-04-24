-- Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- User interests table
create table if not exists user_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  category text not null check (category in ('food', 'activities')),
  bubbles jsonb default '[]'::jsonb,
  free_text text default '',
  created_at timestamptz default now(),
  unique (user_id, category)
);
