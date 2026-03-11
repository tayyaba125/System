-- Run this in your Supabase project → SQL Editor → New Query

-- 1. Create the table that stores each user's data
create table public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 2. Enable Row Level Security (users can only read/write their own data)
alter table public.user_data enable row level security;

-- 3. Policy: users can only see their own row
create policy "Users can read own data"
  on public.user_data for select
  using (auth.uid() = user_id);

-- 4. Policy: users can insert their own row
create policy "Users can insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

-- 5. Policy: users can update their own row
create policy "Users can update own data"
  on public.user_data for update
  using (auth.uid() = user_id);
